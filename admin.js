const SUPABASE_URL = "https://snueglhkazvacwzjoool.supabase.co";
const SUPABASE_KEY = "sb_publishable_xYKfFhPcrVL5AfHTYmEkeQ_KHrRb7I2";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const BUCKET = "media";
const TABLE = "media_items";

function cleanFileName(name) {
  return name
    .toLowerCase()
    .replaceAll(" ", "-")
    .replace(/[^a-z0-9._-]/g, "");
}

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let index = 0;

  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index++;
  }

  return `${size.toFixed(1)} ${units[index]}`;
}

function setProgress(percent) {
  const fill = document.getElementById("progressFill");
  const text = document.getElementById("progressText");

  fill.style.width = `${percent}%`;
  text.textContent = `${percent}%`;
}

function uploadWithProgress(file, filePath, status) {
  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,

      headers: {
        authorization: `Bearer ${SUPABASE_KEY}`,
        apikey: SUPABASE_KEY
      },

      chunkSize: 6 * 1024 * 1024,

      retryDelays: [
        0,
        1000,
        3000,
        5000,
        10000,
        20000
      ],

      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,

      metadata: {
        bucketName: BUCKET,
        objectName: filePath,
        contentType: file.type || "application/octet-stream",
        cacheControl: "3600"
      },

      onProgress(bytesUploaded, bytesTotal) {
        const percent = Math.floor((bytesUploaded / bytesTotal) * 100);

        setProgress(percent);

        status.textContent =
          `Uploading ${percent}% - ` +
          `${formatBytes(bytesUploaded)} of ${formatBytes(bytesTotal)}`;
      },

      onError(error) {
        reject(error);
      },

      onSuccess() {
        setProgress(100);
        resolve();
      }
    });

    upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length > 0) {
        upload.resumeFromPreviousUpload(previousUploads[0]);
      }

      upload.start();
    });
  });
}

async function uploadMedia() {
  const titleInput = document.getElementById("title");
  const descriptionInput = document.getElementById("description");
  const fileInput = document.getElementById("fileInput");
  const status = document.getElementById("status");

  const title = titleInput.value.trim();
  const description = descriptionInput.value.trim();
  const file = fileInput.files[0];

  if (!title || !file) {
    status.textContent = "Title and file are required. Computers remain painfully literal.";
    return;
  }

  setProgress(0);

  const safeName = cleanFileName(file.name);
  const filePath = `${crypto.randomUUID()}-${safeName}`;

  try {
    status.textContent = `Preparing upload: ${formatBytes(file.size)}`;

    await uploadWithProgress(file, filePath, status);

    status.textContent = "Saving media details...";

    const { error: dbError } = await client
      .from(TABLE)
      .insert({
        title,
        description,
        file_path: filePath,
        file_type: file.type || "application/octet-stream"
      });

    if (dbError) {
      throw new Error(dbError.message);
    }

    status.textContent = "Uploaded successfully.";

    titleInput.value = "";
    descriptionInput.value = "";
    fileInput.value = "";
  } catch (error) {
    status.textContent = "Upload failed: " + error.message;
  }
}