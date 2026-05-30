const SUPABASE_URL = "https://snueglhkazvacwzjoool.supabase.co";
const SUPABASE_KEY = "sb_publishable_xYKfFhPcrVL5AfHTYmEkeQ_KHrRb7I2";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const BUCKET = "media";

async function uploadMedia() {
  const title = document.getElementById("title").value.trim();
  const description = document.getElementById("description").value.trim();
  const file = document.getElementById("fileInput").files[0];
  const status = document.getElementById("status");

  if (!title || !file) {
    status.textContent = "Title and file are required. Apparently the computer still needs information.";
    return;
  }

  status.textContent = "Uploading...";

  const safeName = file.name.replaceAll(" ", "-");
  const filePath = `${Date.now()}-${safeName}`;

  const { error: uploadError } = await client.storage
    .from(BUCKET)
    .upload(filePath, file);

  if (uploadError) {
    status.textContent = "Upload failed: " + uploadError.message;
    return;
  }

  const { error: dbError } = await client
    .from("media_items")
    .insert({
      title,
      description,
      file_path: filePath,
      file_type: file.type
    });

  if (dbError) {
    status.textContent = "Database save failed: " + dbError.message;
    return;
  }

  status.textContent = "Uploaded successfully.";

  document.getElementById("title").value = "";
  document.getElementById("description").value = "";
  document.getElementById("fileInput").value = "";
}