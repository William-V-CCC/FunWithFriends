const SUPABASE_URL =
  "https://snueglhkazvacwzjoool.supabase.co";

const SUPABASE_STORAGE_URL =
  "https://snueglhkazvacwzjoool.storage.supabase.co";

const SUPABASE_KEY =
  "sb_publishable_xYKfFhPcrVL5AfHTYmEkeQ_KHrRb7I2";

const client =
  supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

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

  while (
    size >= 1024 &&
    index < units.length - 1
  ) {
    size /= 1024;
    index++;
  }

  return `${size.toFixed(1)} ${units[index]}`;
}

function setProgress(percent) {
  const fill =
    document.getElementById(
      "progressFill"
    );

  const text =
    document.getElementById(
      "progressText"
    );

  fill.style.width = `${percent}%`;
  text.textContent = `${percent}%`;
}

function isSizeError(message) {
  const lower =
    String(message).toLowerCase();

  return (
    lower.includes("413") ||
    lower.includes("maximum size exceeded")
  );
}

async function convertVideoToAudio(
  file,
  status
) {
  status.textContent =
    "Extracting audio fallback...";

  const video =
    document.createElement("video");

  video.src =
    URL.createObjectURL(file);

  video.crossOrigin = "anonymous";

  await video.play().catch(() => {});

  const stream =
    video.captureStream();

  const audioTracks =
    stream.getAudioTracks();

  const audioStream =
    new MediaStream(audioTracks);

  const chunks = [];

  const recorder =
    new MediaRecorder(audioStream, {
      mimeType: "audio/webm"
    });

  return new Promise((resolve, reject) => {
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    recorder.onerror = reject;

    recorder.onstop = () => {
      const blob =
        new Blob(chunks, {
          type: "audio/webm"
        });

      const audioFile =
        new File(
          [blob],
          `${cleanFileName(file.name)}-audio.webm`,
          {
            type: "audio/webm"
          }
        );

      resolve(audioFile);
    };

    recorder.start();

    video.onended = () => {
      recorder.stop();
    };
  });
}

function uploadWithProgress(
  file,
  filePath,
  status
) {
  return new Promise((resolve, reject) => {
    const upload =
      new tus.Upload(file, {
        endpoint:
          `${SUPABASE_STORAGE_URL}/storage/v1/upload/resumable`,

        headers: {
          authorization:
            `Bearer ${SUPABASE_KEY}`,
          apikey:
            SUPABASE_KEY
        },

        chunkSize:
          6 * 1024 * 1024,

        retryDelays: [
          0,
          1000,
          3000,
          5000,
          10000
        ],

        uploadDataDuringCreation: true,

        removeFingerprintOnSuccess: true,

        metadata: {
          bucketName: BUCKET,
          objectName: filePath,
          contentType:
            file.type,
          cacheControl: "3600"
        },

        onProgress(
          bytesUploaded,
          bytesTotal
        ) {
          const percent =
            Math.floor(
              (
                bytesUploaded /
                bytesTotal
              ) * 100
            );

          setProgress(percent);

          status.textContent =
            `Uploading ${percent}% • ` +
            `${formatBytes(bytesUploaded)} / ` +
            `${formatBytes(bytesTotal)}`;
        },

        onError(error) {
          reject(error);
        },

        onSuccess() {
          setProgress(100);
          resolve();
        }
      });

    upload.start();
  });
}

async function saveMediaRecord(
  title,
  description,
  filePath,
  fileType
) {
  const { error } =
    await client
      .from(TABLE)
      .insert({
        title,
        description,
        file_path: filePath,
        file_type: fileType
      });

  if (error) {
    throw error;
  }
}

async function uploadSingleFile(
  file,
  title,
  description,
  status
) {
  const safeName =
    cleanFileName(file.name);

  const filePath =
    `${crypto.randomUUID()}-${safeName}`;

  await uploadWithProgress(
    file,
    filePath,
    status
  );

  await saveMediaRecord(
    title,
    description,
    filePath,
    file.type
  );
}

async function uploadMedia() {
  const title =
    document
      .getElementById("title")
      .value
      .trim();

  const description =
    document
      .getElementById("description")
      .value
      .trim();

  const file =
    document
      .getElementById("fileInput")
      .files[0];

  const status =
    document.getElementById(
      "status"
    );

  if (!title || !file) {
    status.textContent =
      "Title and file required.";

    return;
  }

  try {
    setProgress(0);

    await uploadSingleFile(
      file,
      title,
      description,
      status
    );

    status.textContent =
      "Video uploaded successfully.";
  } catch (error) {
    if (
      !isSizeError(error.message)
    ) {
      status.textContent =
        "Upload failed: " +
        error.message;

      return;
    }

    try {
      setProgress(0);

      const audioFile =
        await convertVideoToAudio(
          file,
          status
        );

      setProgress(0);

      await uploadSingleFile(
        audioFile,
        `${title} (Audio Only)`,
        description,
        status
      );

      status.textContent =
        "Video too large. Uploaded audio-only fallback.";
    } catch (audioError) {
      status.textContent =
        "Fallback failed: " +
        audioError.message;
    }
  }
}