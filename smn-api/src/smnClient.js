import axios from 'axios';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';
import { config, ENDPOINTS } from './config.js';

/**
 * SMN (O'zavtoyo'l monitoring) bilan ishlaydigan klient.
 * - Spring Security form-login (/j_security_login) orqali kiradi
 * - Cookie (JSESSIONID) ni jar ichida saqlaydi
 * - Sessiya tugasa avtomatik qayta kiradi (bir marta retry)
 * - Keep-alive bilan sessiyani tirik ushlaydi
 */
class SmnClient {
  constructor() {
    this.jar = new CookieJar();
    this.http = wrapper(axios.create({
      jar: this.jar,
      baseURL: config.baseUrl,
      timeout: 30000,
      maxRedirects: 5,
      // 4xx/3xx larni o'zimiz tekshiramiz
      validateStatus: () => true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (SMN-API proxy)',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept-Language': 'ru,uz;q=0.9,en;q=0.8',
      },
    }));
    this.loggedIn = false;
    this._loginPromise = null;   // parallel loginlarni birlashtirish
    this._captchaLocked = false; // captcha chiqsa qayta-qayta urinmaslik uchun
  }

  async _doLogin() {
    if (this._captchaLocked) {
      throw Object.assign(new Error(
        'Login bloklangan: SMN captcha so\'rayapti. Brauzerda bir marta qo\'lda kirib, keyin API\'ni qayta ishga tushiring.'
      ), { code: 'CAPTCHA_REQUIRED' });
    }

    // 1) Login sahifasini ochib boshlang'ich sessiya cookie olamiz
    await this.http.get(ENDPOINTS.loginPage);

    // 2) Credentiallarni POST qilamiz
    const body = new URLSearchParams({
      j_username: config.username,
      j_password: config.password,
      remember: 'on',
    });
    // Redirectni kuzatmaymiz: Spring 302 javobida JSESSIONID cookie beradi,
    // uni to'g'ridan-to'g'ri jar'ga yozib olamiz (redirect zanjirida yo'qolmasin).
    const res = await this.http.post(ENDPOINTS.loginPost, body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      maxRedirects: 0,
    });

    // 3) Asosiy sahifani ochamiz: SMN xarita holatini sessiyaga shu yerda
    // yozadi. Bevosita jonli ro'yxatga borilsa, server ichida NullPointer
    // chiqadi -- ya'ni brauzerdagi qadamni takrorlash kerak.
    await this.http.get(ENDPOINTS.mainPage);

    // 4) Muvaffaqiyatni tekshirish: himoyalangan JSON endpoint ishlashi kerak.
    // `updtime` majburiy: usiz SMN JSON emas, xato sahifasini qaytaradi.
    const check = await this.http.get(ENDPOINTS.liveList, {
      params: { salt: Date.now(), updtime: 0 },
    });
    const ok = this._looksLikeValidData(check);
    if (!ok) {
      // Captcha faqat formada captcha maydoni paydo bo'lgandagina talab
      // qilinadi. Ilgari sahifa matnida «captcha» so'zi qidirilardi, u esa
      // skript va uslublarda doim bor -- natijada oddiy xato parol ham
      // «captcha kerak» deb ko'rsatilar, jarayon esa qulflanib qolardi.
      const location = String(res.headers?.location || '');
      const rejected = location.includes('login_error');
      if (!rejected && (await this._captchaRequired())) {
        this._captchaLocked = true;
        throw Object.assign(new Error('Login rad etildi va captcha talab qilinmoqda.'),
          { code: 'CAPTCHA_REQUIRED' });
      }
      throw Object.assign(new Error(
        rejected
          ? 'Login rad etildi: login yoki parol noto\'g\'ri.'
          : 'Login o\'tdi, lekin ma\'lumot olinmadi -- SMN endpointi o\'zgargan bo\'lishi mumkin.'
      ), { code: 'LOGIN_FAILED' });
    }

    this.loggedIn = true;
    this._captchaLocked = false;
    return check.data; // birinchi live datani qaytaramiz (bonus)
  }

  async login() {
    if (this._loginPromise) return this._loginPromise;
    this._loginPromise = this._doLogin().finally(() => { this._loginPromise = null; });
    return this._loginPromise;
  }

  /** Login formasida captcha maydoni bormi -- matndagi so'z emas, maydonning o'zi. */
  async _captchaRequired() {
    try {
      const page = await this.http.get(ENDPOINTS.loginPage);
      const html = typeof page.data === 'string' ? page.data : '';
      return /<input[^>]+name=["']?captcha/i.test(html);
    } catch {
      return false;
    }
  }

  _looksLikeValidData(res) {
    const ct = String(res.headers?.['content-type'] || '');
    if (res.status !== 200) return false;
    if (ct.includes('text/html')) return false; // login sahifasiga otib yuborilgan
    const d = res.data;
    if (d && typeof d === 'object') {
      if (d.error) return false;
      return Array.isArray(d.data) || Array.isArray(d.objects) || 'nextUpdTime' in d;
    }
    return false;
  }

  _isSessionDead(res) {
    const ct = String(res.headers?.['content-type'] || '');
    const url = String(res.request?.res?.responseUrl || '');
    if (res.status === 401 || res.status === 403) return true;
    if (url.includes('login.htm') || url.includes(ENDPOINTS.timeout)) return true;
    // JSON kutgan joyda HTML kelsa — sessiya o'lgan
    if (ct.includes('text/html')) return true;
    if (res.data && typeof res.data === 'object' && res.data.error) return true;
    return false;
  }

  /**
   * Autentifikatsiyani ta'minlab GET so'rov yuboradi.
   * Sessiya o'lgan bo'lsa bir marta qayta login qilib retry qiladi.
   */
  async authedGet(path, { params = {}, responseType } = {}) {
    if (!this.loggedIn) await this.login();

    const doReq = () => this.http.get(path, {
      // Jonli ro'yxat `updtime` siz xato sahifasi qaytaradi; qolgan
      // endpointlar uni e'tiborsiz qoldiradi.
      params: { updtime: 0, ...params, salt: Date.now() },
      responseType,
    });

    let res = await doReq();
    if (this._isSessionDead(res)) {
      this.loggedIn = false;
      await this.login();
      res = await doReq();
      if (this._isSessionDead(res)) {
        throw Object.assign(new Error('Sessiya tiklanmadi'), { code: 'SESSION_LOST' });
      }
    }
    return res;
  }

  /** Sessiyani tirik ushlash uchun yengil so'rov */
  async keepAlive() {
    try {
      const res = await this.authedGet(ENDPOINTS.liveList);
      return this._looksLikeValidData(res);
    } catch {
      return false;
    }
  }
}

export const smn = new SmnClient();
