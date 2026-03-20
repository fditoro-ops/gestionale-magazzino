export async function uploadCashClosureReceipt(params: {
  file: any;
}) {
  const { file } = params;

  return {
    receipt_image_url: `/uploads/${file.filename}`,
    receipt_image_name: file.originalname,
  };
}
