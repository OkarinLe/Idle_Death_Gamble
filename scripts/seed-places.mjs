// Adds the gym places and the football "place". Safe to run again (matches on slug).
// Run: npm run seed-places
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// capacity = the most people allowed at once (used for "how many people" markets).
// Football is a "place" only so its game result can live in the same readings table.
const PLACES = [
  { slug: "war-memorial-hall", name: "War Memorial Hall", category: "gym", capacity: 1200 },
  { slug: "mccomas-hall", name: "McComas Hall", category: "gym", capacity: 600 },
  { slug: "esports", name: "Esports", category: "gym", capacity: 55 },
  { slug: "bouldering-wall", name: "Bouldering Wall", category: "gym", capacity: 8 },
  { slug: "hokies-football", name: "Hokies Football", category: "sports", capacity: null },
];

const { data, error } = await supabase.from("places").upsert(PLACES, { onConflict: "slug" }).select("slug");
if (error) {
  console.error("Seeding failed:", error.message);
  process.exitCode = 1;
} else {
  console.log("Places ready:", data.map((p) => p.slug).join(", "));
}
