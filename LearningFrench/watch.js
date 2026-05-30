const SUPABASE_URL = "https://snueglhkazvacwzjoool.supabase.co";
const SUPABASE_KEY = "sb_publishable_xYKfFhPcrVL5AfHTYmEkeQ_KHrRb7I2";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const BUCKET = "media";

async function loadMedia() {
  const container = document.getElementById("mediaList");

  const { data, error } = await client
    .from("media_items")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    container.textContent = "Failed to load media: " + error.message;
    return;
  }

  container.innerHTML = "";

  data.forEach((item) => {
    const { data: publicData } = client.storage
      .from(BUCKET)
      .getPublicUrl(item.file_path);

    const url = publicData.publicUrl;

    const card = document.createElement("div");
    card.style.border = "1px solid black";
    card.style.padding = "15px";
    card.style.marginBottom = "20px";

    const title = document.createElement("h2");
    title.textContent = item.title;

    const id = document.createElement("p");
    id.textContent = "ID: " + item.id;

    const description = document.createElement("p");
    description.textContent = item.description || "No description.";

    card.appendChild(title);
    card.appendChild(id);
    card.appendChild(description);

    if (item.file_type.startsWith("video/")) {
      const video = document.createElement("video");
      video.src = url;
      video.controls = true;
      video.style.width = "100%";
      video.style.maxWidth = "700px";
      card.appendChild(video);
    }

    if (item.file_type.startsWith("audio/")) {
      const audio = document.createElement("audio");
      audio.src = url;
      audio.controls = true;
      card.appendChild(audio);
    }

    const link = document.createElement("p");
    link.innerHTML = `<a href="${url}" target="_blank">Open file</a>`;
    card.appendChild(link);

    container.appendChild(card);
  });
}

loadMedia();