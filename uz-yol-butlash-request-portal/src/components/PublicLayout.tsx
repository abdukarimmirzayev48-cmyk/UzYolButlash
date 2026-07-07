import type { ReactNode } from "react";

interface PublicLayoutProps {
  children: ReactNode;
}

export function PublicLayout({ children }: PublicLayoutProps) {
  return (
    <div className="public-page">
      <header className="public-header">
        <div className="public-header-inner">
          <div className="header-title">
            <h1>Talabnoma yuborish</h1>
            <p>Yo'l bitumi mahsulotlari bo'yicha talabnoma yuborish xizmati</p>
          </div>
        </div>
      </header>
      <main className="public-main">{children}</main>
      <footer className="public-footer">
        <strong>© UzYolButlash</strong>
      </footer>
    </div>
  );
}
