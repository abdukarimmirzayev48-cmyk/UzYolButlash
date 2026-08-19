async function render() {
  try {
    const isPublicRequestRoute = location.pathname === "/talabnoma" || location.pathname === "/request";
    document.body.classList.toggle("public-layout", isPublicRequestRoute);
    if (isPublicRequestRoute) {
      await renderPublicTalabnoma();
      return;
    }
    if (location.pathname === "/login") {
      await renderLoginPage();
      return;
    }
    if (!currentUser) await loadCurrentUser();
    if (!currentUser) {
      navigate("/login");
      return;
    }
    document.body.classList.remove("public-layout");
    renderCurrentUserBadge();
    updateSidebarActiveLink();
    if (location.pathname === "/users") {
      await renderUsersList();
    } else if (location.pathname === "/attendance") {
      await renderAttendanceList();
    } else if (location.pathname === "/employees") {
      await renderEmployeesList();
    } else if (location.pathname === "/departments") {
      // Bo'limlar is now a tab on the Xodimlar page; keep the old URL working.
      navigate("/employees?tab=departments");
      return;
    } else if (location.pathname === "/dashboard") {
      await renderDashboardOverview();
    } else if (location.pathname === "/profit") {
      await renderProfitPage();
    } else if (location.pathname === "/cashflow") {
      await renderCashflowPage();
    } else if (location.pathname === "/receivables") {
      await renderReceivablesPage();
    } else if (location.pathname === "/payables") {
      await renderPayablesPage();
    } else if (location.pathname === "/supplier-invoices/new") {
      await renderNewSupplierInvoice();
    } else if (/^\/supplier-invoices\/\d+\/edit$/.test(location.pathname)) {
      await renderEditSupplierInvoice(getSupplierInvoiceIdFromPath());
    } else if (/^\/supplier-invoices\/\d+$/.test(location.pathname)) {
      await renderSupplierInvoiceDetail(getSupplierInvoiceIdFromPath());
    } else if (location.pathname === "/supplier-invoices") {
      await renderSupplierInvoicesList();
    } else if (location.pathname === "/supplier-payments/new") {
      await renderNewSupplierPayment();
    } else if (/^\/supplier-payments\/\d+\/edit$/.test(location.pathname)) {
      await renderEditSupplierPayment(getSupplierPaymentIdFromPath());
    } else if (/^\/supplier-payments\/\d+$/.test(location.pathname)) {
      await renderSupplierPaymentDetail(getSupplierPaymentIdFromPath());
    } else if (location.pathname === "/supplier-payments") {
      await renderSupplierPaymentsList();
    } else if (/^\/customer-requests\/\d+\/edit$/.test(location.pathname)) {
      await renderEditCustomerRequest(getCustomerRequestIdFromPath());
    } else if (/^\/customer-requests\/\d+$/.test(location.pathname)) {
      await renderCustomerRequestDetail(getCustomerRequestIdFromPath());
    } else if (location.pathname === "/customer-requests") {
      await renderCustomerRequestsList();
    } else if (location.pathname === "/exchange-tickets/new") {
      await renderNewExchangeTicket();
    } else if (/^\/exchange-tickets\/\d+$/.test(location.pathname)) {
      await renderExchangeTicketDetail(getExchangeTicketIdFromPath());
    } else if (location.pathname === "/exchange-tickets") {
      await renderExchangeTicketsList();
    } else if (/^\/stock\/\d+$/.test(location.pathname)) {
      await renderStockLotDetail(getStockLotIdFromPath());
    } else if (location.pathname === "/stock" || location.pathname === "/inventory") {
      await renderStockList();
    } else if (location.pathname === "/suppliers/new") {
      await renderNewSupplier();
    } else if (/^\/suppliers\/\d+\/edit$/.test(location.pathname)) {
      await renderEditSupplier(getSupplierIdFromPath());
    } else if (/^\/suppliers\/\d+$/.test(location.pathname)) {
      await renderSupplierDetail(getSupplierIdFromPath());
    } else if (location.pathname === "/suppliers") {
      await renderSuppliersList();
    } else if (/^\/procurements\/\d+$/.test(location.pathname)) {
      await renderProcurementDetail(getProcurementIdFromPath());
    } else if (location.pathname === "/procurements") {
      await renderProcurementsList();
    } else if (location.pathname === "/customer-invoices/new") {
      await renderNewInvoice();
    } else if (/^\/customer-invoices\/\d+\/edit$/.test(location.pathname)) {
      await renderEditInvoice(getInvoiceIdFromPath());
    } else if (/^\/customer-invoices\/\d+$/.test(location.pathname)) {
      await renderInvoiceDetail(getInvoiceIdFromPath());
    } else if (location.pathname === "/customer-invoices") {
      await renderInvoicesList();
    } else if (location.pathname === "/customer-payments/new") {
      await renderNewPayment();
    } else if (/^\/customer-payments\/\d+\/edit$/.test(location.pathname)) {
      await renderEditPayment(getPaymentIdFromPath());
    } else if (/^\/customer-payments\/\d+$/.test(location.pathname)) {
      await renderPaymentDetail(getPaymentIdFromPath());
    } else if (location.pathname === "/customer-payments") {
      await renderPaymentsList();
    } else if (location.pathname === "/delivery-batches/new") {
      await renderNewBatch();
    } else if (/^\/delivery-batches\/\d+\/edit$/.test(location.pathname)) {
      await renderEditBatch(getBatchIdFromPath());
    } else if (/^\/delivery-batches\/\d+$/.test(location.pathname)) {
      await renderBatchDetail(getBatchIdFromPath());
    } else if (location.pathname === "/delivery-batches") {
      await renderDeliveryBatchesList();
    } else if (/^\/logistics\/\d+$/.test(location.pathname)) {
      await renderLogisticsDetail(getLogisticsIdFromPath());
    } else if (location.pathname === "/logistics") {
      await renderLogisticsList();
    } else if (location.pathname === "/transports/new") {
      await renderNewTransport();
    } else if (location.pathname === "/transports/monitoring") {
      await renderTransportMonitoring();
    } else if (/^\/transports\/\d+\/edit$/.test(location.pathname)) {
      await renderEditTransport(getTransportIdFromPath());
    } else if (/^\/transports\/\d+\/fuel$/.test(location.pathname)) {
      await renderTransportFuelLog(getTransportIdFromPath());
    } else if (location.pathname === "/transports") {
      await renderTransportsList();
    } else if (location.pathname === "/audit-log") {
      await renderAuditLog();
    } else if (location.pathname === "/delivery") {
      await renderDeliveryOverview();
    } else if (location.pathname === "/tasks/new") {
      await renderNewTask();
    } else if (/^\/tasks\/\d+\/edit$/.test(location.pathname)) {
      await renderEditTask(getTaskIdFromPath());
    } else if (/^\/tasks\/\d+$/.test(location.pathname)) {
      await renderTaskDetail(getTaskIdFromPath());
    } else if (location.pathname === "/tasks") {
      await renderTasksList();
    } else if (location.pathname === "/orders/new") {
      await renderNewOrder();
    } else if (/^\/orders\/\d+\/edit$/.test(location.pathname)) {
      await renderEditOrder(getOrderIdFromPath());
    } else if (/^\/orders\/\d+$/.test(location.pathname)) {
      await renderOrderDetail(getOrderIdFromPath());
    } else if (location.pathname === "/orders") {
      await renderOrdersList();
    } else if (location.pathname === "/contracts/upload") {
      await renderContractUpload();
    } else if (location.pathname === "/contracts/new") {
      await renderNewContract();
    } else if (/^\/contracts\/\d+\/edit$/.test(location.pathname)) {
      await renderEditContract(getContractIdFromPath());
    } else if (/^\/contracts\/\d+$/.test(location.pathname)) {
      await renderContractDetail(getContractIdFromPath());
    } else if (location.pathname === "/contracts") {
      await renderContractsList();
    } else if (location.pathname === "/products/new") {
      await renderNewProduct();
    } else if (/^\/products\/\d+\/edit$/.test(location.pathname)) {
      await renderEditProduct(getProductIdFromPath());
    } else if (location.pathname === "/products") {
      await renderProductsList();
    } else if (location.pathname === "/clients/new") {
      await renderNewClient();
    } else if (/^\/clients\/\d+\/edit$/.test(location.pathname)) {
      await renderEditClient(getIdFromPath());
    } else if (/^\/clients\/\d+$/.test(location.pathname)) {
      await renderDetail(getIdFromPath());
    } else {
      await renderClientsList();
    }
    setupFormattedNumberInputs(app);
    bindSelectSearch(app);
    bindRuDateFields(app);
    document.querySelectorAll("[data-nav]").forEach((button) => {
      button.addEventListener("click", () => navigate(button.dataset.nav));
    });
  } catch (error) {
    app.innerHTML = `<div class="page"><div class="empty error">${esc(error.message)}</div></div>`;
  }
}

initSidebar();
window.addEventListener("popstate", render);
render();
