export async function processCicRow(_row: any, _tenantId: string) {
  return { status: "DISABLED" };
}

export async function processPendingRow(_row: any) {
  return;
}
