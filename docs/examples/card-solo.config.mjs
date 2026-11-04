// A card on its own, like a plain card image: no taglines (so no header) and
// no field (so no margins, and a line-by-line reveal).
export default {
  taglines: [],
  field: { preset: "none" },
  data: "cards.json",
  cards: [
    {
      user: "hartestarke",
      title: "[HARTE]",
      rows: [
        ["role", "software engineer"],
        ["focus", "backend · distributed systems · AI agents"],
      ],
      activity: "calendar",
      reveal: "decode",
    },
  ],
};
