import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";

export const getS3 = () =>
  new S3Client({
    region: "auto",
    endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });

export const uploadToR2 = async (buffer, contentType = "video/mp4") => {
  const key = `videos/${uuidv4()}.${contentType === "video/mp4" ? "mp4" : contentType.split("/")[1] || "mp4"}`;
  await getS3().send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  return { key, url: `${process.env.R2_PUBLIC_URL}/${key}` };
};