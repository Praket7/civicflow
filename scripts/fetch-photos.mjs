const QUERIES = [
  ["mission-control-hero", "food bank volunteers distribution"],
  ["welcome-hero", "volunteer food bank smiling"],
  ["signin-hero", "food bank volunteers boxes"],
  ["food-distribution", "food distribution volunteers"],
  ["community-garden", "community garden volunteers"],
  ["library-tutoring", "tutoring children library"],
  ["park-cleanup", "volunteers park cleanup"],
  ["animal-shelter", "animal shelter volunteer dog"],
  ["senior-meals", "meal delivery volunteers"],
  ["community-event", "community mural painting"],
  ["pantry-setup", "food pantry shelves"],
  ["buffalo-skyline", "Buffalo New York skyline"],
  ["portrait-1", "woman portrait smiling"],
  ["portrait-2", "man portrait smiling"],
  ["portrait-3", "woman portrait outdoor"],
  ["portrait-4", "man portrait outdoor"],
  ["portrait-5", "woman portrait professional"],
  ["portrait-6", "man portrait professional"],
  ["portrait-7", "woman portrait natural light"],
  ["portrait-8", "man portrait natural light"],
  ["portrait-9", "woman portrait casual"],
  ["portrait-10", "man portrait casual"],
];

const API = "https://commons.wikimedia.org/w/api.php";
const fs = await import("node:fs/promises");
await fs.mkdir("/tmp/commons", { recursive: true });
const manifest = [];

for (const [slug, query] of QUERIES) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: "12",
    prop: "imageinfo",
    iiprop: "url|size|extmetadata|mime",
    iiurlwidth: "1800",
  });
  let pages;
  try {
    const res = await fetch(`${API}?${params}`, {
      headers: {
        "User-Agent": "CivicFlow/0.1 (FBLA competition project; contact: demo@example.com)",
      },
      signal: AbortSignal.timeout(20000),
    });
    pages = Object.values((await res.json()).query?.pages ?? {});
  } catch (err) {
    console.error("search failed", slug, err.message);
    continue;
  }
  let picked = 0;
  for (const page of pages ?? []) {
    if (picked >= 3) break;
    const info = page.imageinfo?.[0];
    if (!info || info.mime !== "image/jpeg") continue;
    if ((info.width ?? 0) < 1200) continue;
    const meta = info.extmetadata ?? {};
    const license = meta.LicenseShortName?.value ?? "";
    if (/non-free|fair use|GFDL 1\.2 only/i.test(license)) continue;
    const url = info.thumburl ?? info.url;
    try {
      const img = await fetch(url, {
        headers: { "User-Agent": "CivicFlow/0.1 (FBLA competition project)" },
        signal: AbortSignal.timeout(25000),
      });
      if (!img.ok) continue;
      const buf = Buffer.from(await img.arrayBuffer());
      if (buf.length < 40000) continue;
      const file = `/tmp/commons/${slug}-${picked + 1}.jpg`;
      await fs.writeFile(file, buf);
      manifest.push({
        file,
        slug,
        title: page.title,
        creator: meta.Artist?.value?.replace(/<[^>]*>/g, "").trim() ?? "Unknown",
        license,
        licenseUrl: meta.LicenseUrl?.value ?? "",
        landing: info.descriptionurl,
        width: info.width,
        height: info.height,
        description: (meta.ImageDescription?.value ?? "").replace(/<[^>]*>/g, " ").slice(0, 200),
      });
      picked += 1;
    } catch (err) {
      console.error("download failed", slug, err.message);
    }
  }
  console.log(slug, "picked", picked);
}
await fs.writeFile("/tmp/commons/manifest.json", JSON.stringify(manifest, null, 2));
console.log("done", manifest.length);
