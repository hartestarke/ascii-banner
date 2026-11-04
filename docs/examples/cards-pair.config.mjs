export default {
  taglines: ["two cards", "drops, crystal"],
  data: "cards.json",
  cards: [
    // a half card has about 30 text columns beside its portrait: show the rows that fit
    { user: "hartestarke", width: "half", show: ["uptime", "languages"], reveal: "drops", intro: "loop", backdrop: "window" },
    { repo: "hartestarke/ascii-banner", width: "half", show: ["release", "license", "languages"], reveal: "crystal", backdrop: "window" },
  ],
};
