import { createRequestHandler } from "@react-router/express";
import compression from "compression";
import express from "express";
import morgan from "morgan";

const app = express();

const UPLOAD_LIMIT = "2gb";
app.use(express.json({ limit: UPLOAD_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: UPLOAD_LIMIT }));

app.use(compression());
app.disable("x-powered-by");

app.use("/assets", express.static("build/client/assets", { immutable: true, maxAge: "1y" }));
app.use(express.static("build/client", { maxAge: "1h" }));

app.use(morgan("tiny"));

app.all("*", createRequestHandler({
  build: await import("./build/server/index.js"),
}));

const port = process.env.PORT || 3000;
const server = app.listen(port, () => console.log(`App listening on port ${port}`));

server.keepAliveTimeout = 10 * 60 * 1000;
server.headersTimeout   = 10 * 60 * 1000 + 1000;