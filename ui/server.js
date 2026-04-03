const express = require("express");
const path = require("path");

const app = express();
const PORT = 3080;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log(`Caddy UI running on http://localhost:${PORT}`);
});

module.exports = app;
