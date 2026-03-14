export type UserRole = "ADMIN" | "MAGAZZINO" | "OPERATORE" | "CONTABILITA";

export type Permission =
  | "DASHBOARD_VIEW"
  | "ITEMS_VIEW"
  | "ITEMS_EDIT"
  | "ORDERS_VIEW"
  | "ORDERS_EDIT"
  | "RECEIPTS_VIEW"
  | "RECEIPTS_EDIT"
  | "MOVEMENTS_VIEW"
  | "MOVEMENTS_EDIT"
  | "INVENTORY_VIEW"
  | "INVENTORY_EDIT"
  | "REPORTS_VIEW"
  | "USERS_VIEW"
  | "USERS_EDIT";

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  ADMIN: [
    "DASHBOARD_VIEW",
    "ITEMS_VIEW",
    "ITEMS_EDIT",
    "ORDERS_VIEW",
    "ORDERS_EDIT",
    "RECEIPTS_VIEW",
    "RECEIPTS_EDIT",
    "MOVEMENTS_VIEW",
    "MOVEMENTS_EDIT",
    "INVENTORY_VIEW",
    "INVENTORY_EDIT",
    "REPORTS_VIEW",
    "USERS_VIEW",
    "USERS_EDIT",
  ],
  MAGAZZINO: [
    "DASHBOARD_VIEW",
    "ITEMS_VIEW",
    "ITEMS_EDIT",
    "ORDERS_VIEW",
    "ORDERS_EDIT",
    "RECEIPTS_VIEW",
    "RECEIPTS_EDIT",
    "MOVEMENTS_VIEW",
    "MOVEMENTS_EDIT",
    "INVENTORY_VIEW",
    "INVENTORY_EDIT",
  ],
  OPERATORE: [
    "DASHBOARD_VIEW",
    "ITEMS_VIEW",
    "MOVEMENTS_VIEW",
  ],
  CONTABILITA: [
    "DASHBOARD_VIEW",
    "ORDERS_VIEW",
    "RECEIPTS_VIEW",
    "MOVEMENTS_VIEW",
    "REPORTS_VIEW",
  ],
};

export function hasPermission(role: UserRole, permission: Permission) {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
