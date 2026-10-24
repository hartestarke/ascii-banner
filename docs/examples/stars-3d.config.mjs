export default {
  taglines: ["counting stars", "blocks 3d"],
  tagline: { font: "blocks-3d", maxHeight: 0.45, color: "#2D8CE6", shadowColor: "#8A5CF6" },
  field: {
    preset: "stars", loopSeconds: 12, ramp: "dots", bands: 1, options: { density: 0.08, drift: 2 },
    gradient: ["#14A38B", "#2D8CE6", "#8A5CF6", "#E62D42"],
  },
  reveal: { preset: "fall", seconds: 1.8, hold: 3.6 },
};
