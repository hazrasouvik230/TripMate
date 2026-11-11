/**
 * A small sample of curated travel information for ingestion.
 * Each entry becomes one or more embedded chunks (TravelDocument rows).
 * Content is intentionally multi-paragraph so chunking has something to do.
 */
export const sampleTravelDocs = [
  {
    title: "Tokyo — Getting Around",
    destination: "Tokyo",
    category: "transport",
    source: "tripmate/curated/tokyo-transport",
    metadata: { language: "en", tags: ["metro", "trains", "ic-card"] },
    content: `Tokyo's public transport is dense, punctual and the easiest way to move around the city. The backbone is the combination of the Tokyo Metro, the Toei subway lines and the JR network, including the circular Yamanote line that connects major hubs like Shinjuku, Shibuya, Tokyo Station and Ueno.

Buy a rechargeable Suica or PASMO IC card on arrival. You tap in and out at the gates, and the same card works on subways, JR trains, most buses and even many convenience stores and vending machines. It removes the need to work out individual fares for each journey.

Trains run roughly from 5am to just after midnight. Avoid the morning rush between about 8am and 9am if you can, when central lines are extremely crowded. Taxis are clean and reliable but expensive; they make sense late at night once the trains stop. For longer trips out of the city, the shinkansen (bullet train) departs from Tokyo and Shinagawa stations.`,
  },
  {
    title: "Tokyo — Food and Dining",
    destination: "Tokyo",
    category: "food",
    source: "tripmate/curated/tokyo-food",
    metadata: { language: "en", tags: ["sushi", "ramen", "izakaya"] },
    content: `Tokyo has more to offer food-wise than almost any city on earth, from cheap standing noodle bars to the world's densest cluster of high-end restaurants. You do not need a big budget to eat extremely well.

For breakfast, try a bowl of rice with grilled fish at a traditional spot, or pastries from a depachika (the food hall in the basement of a department store). Lunch is the best-value meal: many top restaurants offer set lunches at a fraction of their dinner price. Ramen shops, soba counters and conveyor-belt sushi are quick, affordable and everywhere.

In the evening, an izakaya is the classic choice — a casual pub where you order many small dishes to share alongside beer, sake or highballs. Neighbourhoods like Shinjuku's Omoide Yokocho and the alleys of Ebisu are full of them. Reservations are recommended for popular sushi counters and anything featured in a guidebook.`,
  },
  {
    title: "Rome — Highlights and History",
    destination: "Rome",
    category: "overview",
    source: "tripmate/curated/rome-overview",
    metadata: { language: "en", tags: ["colosseum", "vatican", "history"] },
    content: `Rome rewards walking. The historic centre is compact enough to cross on foot, and many of its greatest sights sit within a short stroll of one another. Start at the Colosseum and the adjacent Roman Forum and Palatine Hill, where a single combined ticket covers all three — book a timed entry online to skip the longest queues.

From there, head north to the Pantheon, a remarkably intact ancient temple with a vast unreinforced concrete dome, then on to the Trevi Fountain and the Spanish Steps. The Vatican, an independent state within the city, holds St Peter's Basilica and the Vatican Museums with the Sistine Chapel; go early or late to avoid crowds.

Rome is also a city of neighbourhoods. Trastevere, across the river, is a maze of cobbled lanes that comes alive in the evening. Allow time simply to wander, sit in a piazza, and let the layers of two thousand years of history reveal themselves.`,
  },
  {
    title: "Bali — When to Go and What to Expect",
    destination: "Bali",
    category: "overview",
    source: "tripmate/curated/bali-overview",
    metadata: { language: "en", tags: ["weather", "seasons", "beaches"] },
    content: `Bali has two seasons: dry and wet. The dry season, roughly April to October, is the most popular time to visit, with sunny days and lower humidity — ideal for beaches, surfing and hiking. July and August are the busiest and priciest months, coinciding with European and Australian holidays.

The wet season, November to March, brings warm temperatures and short, heavy afternoon downpours rather than all-day rain. Prices are lower, the island is greener, and the rice terraces around Ubud look their best. Mornings are often clear even in the wet months.

The south — Seminyak, Canggu and Uluwatu — is the hub for beaches, surf and nightlife. Ubud, inland, is the cultural heart, surrounded by rice paddies, temples and yoga retreats. The east and north are quieter, with black-sand beaches, diving and a slower pace.`,
  },
];

export default sampleTravelDocs;
