export async function uploadCashClosureReceipt(params: {
  file: Express.Multer.File;
}) {
  const { file } = params;

  // TODO: sostituisci con upload reale
  // ad esempio S3 / Cloudinary

  return {
    receipt_image_url: `/uploads/${file.filename}`,
    receipt_image_name: file.originalname,
  };
}
