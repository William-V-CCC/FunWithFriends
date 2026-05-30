const SUPABASE_URL = "https://snueglhkazvacwzjoool.supabase.co";
const SUPABASE_STORAGE_URL = "https://snueglhkazvacwzjoool.storage.supabase.co";
const SUPABASE_KEY = "sb_publishable_xYKfFhPcrVL5AfHTYmEkeQ_KHrRb7I2";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const BUCKET = "media";
const TABLE = "media_items";

let ffmpegInstance = null;

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

  if (!fill || !text) return;

  fill.style.width = `${percent}%`;
  text.textContent = `${percent}%`;
}

function isSizeLimitError(error) {
  const message = String(error?.message || error || "").toLowerCase();

  return (
    message.includes("maximum size exceeded") ||
    message.includes("413") ||
    message.includes("payload too large")
  );
}

async function loadFFmpeg(status) {
  if (ffmpegInstance) return ffmpegInstance;

  status.textContent = "Loading audio converter...";

  const { FFmpeg } = FFmpegWASM;
  const { toBlobURL } = FFmpegUtil;

  const ffmpeg = new FFmpeg();

  await ffmpeg.load({
    coreURL: await toBlobURL(
      "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js",
      "text/javascript"
    ),
    wasmURL: await toBlobURL(
      "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm",
      "application/wasm"
    )
  });

  ffmpegInstance = ffmpeg;
  return ffmpeg;
}

async function convertToMp3(file, status) {
  const ffmpeg = await loadFFmpeg(status);

  const inputName = `input-${crypto.randomUUID()}.${file.name.split(".").pop() || "mp4"}`;
  const outputName = `audio-${crypto.randomUUID()}.mp3`;

  status.textContent = "Converting video to MP3 audio only...";

  const fileBuffer = new Uint8Array(await file.arrayBuffer());

  await ffmpeg.writeFile(inputName, fileBuffer);

  await ffmpeg.exec([
    "-i",
    inputName,

    "-vn",

    "-ac",
    "1",

    "-ar",
    "22050",

    "-b:a",
    "64k",

    outputName
  ]);

  const mp3Data = await ffmpeg.readFile(outputName);

  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);

  return new File(
    [mp3Data.buffer],
    `${cleanFileName(file.name).replace(/\.[^/.]+$/, "")}-audio-only.mp3`,
    {
      type: "audio/mpeg"
    }
  );
}

function uploadWithProgress(file, filePath, status) {
  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${SUPABASE_STORAGE_URL}/storage/v1/upload/resumable`,

      headers: {
        authorization: `Bearer ${SUPABASE_KEY}`,
        apikey: SUPABASE_KEY
      },

      chunkSize: 6 * 1024 * 1024,

      retryDelays: [0, 1000, 3000, 5000, 10000, 20000],

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

async function saveMediaRecord({ title, description, filePath, fileType }) {
  const { error } = await client.from(TABLE).insert({
    title,
    description,
    file_path: filePath,
    file_type: fileType
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function uploadFileAndRecord({ file, title, description, status }) {
  const safeName = cleanFileName(file.name);
  const filePath = `${crypto.randomUUID()}-${safeName}`;

  await uploadWithProgress(file, filePath, status);

  status.textContent = "Saving media details...";

  await saveMediaRecord({
    title,
    description,
    filePath,
    fileType: file.type || "application/octet-stream"
  });
}

async function uploadMedia() {
  const titleInput = document.getElementById("title");
  const descriptionInput = document.getElementById("description");
  const fileInput = document.getElementById("fileInput");
  const status = document.getElementById("status");

  const title = titleInput.value.trim();
  const description = descriptionInput.value.trim();
  const originalFile = fileInput.files[0];

  if (!title || !originalFile) {
    status.textContent = "Title and file are required. Computers remain painfully needy.";
    return;
  }

  setProgress(0);

  try {
    status.textContent = `Trying full file upload: ${formatBytes(originalFile.size)}`;

    await uploadFileAndRecord({
      file: originalFile,
      title,
      description,
      status
    });

    status.textContent = "Uploaded full file successfully.";
  } catch (error) {
    if (!isSizeLimitError(error)) {
      status.textContent = "Upload failed: " + error.message;
      return;
    }

    try {
      setProgress(0);

      status.textContent =
        "Video was too large. Converting to MP3 audio only...";

      const mp3File = await convertToMp3(originalFile, status);

      setProgress(0);

      status.textContent = `Uploading MP3 fallback: ${formatBytes(mp3File.size)}`;

      await uploadFileAndRecord({
        file: mp3File,
        title: `${title} Audio Only`,
        description:
          description +
          "\n\nOriginal video was too large, so this was uploaded as MP3 audio only.",
        status
      });

      status.textContent = "Uploaded MP3 fallback successfully.";
    } catch (mp3Error) {
      status.textContent = "MP3 fallback failed: " + mp3Error.message;
      return;
    }
  }

  titleInput.value = "";
  descriptionInput.value = "";
  fileInput.value = "";
}