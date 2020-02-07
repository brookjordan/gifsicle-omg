const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { execFile } = require("child_process");
const gifsicle = require("gifsicle");
const app = require("express")();

let uploadGif = multer({ dest: "i" })

function sendGif(request, resource, next) {
  let filePath = path.join(__dirname, request.global.gifPath);
  let fileType = "image/gif";
  let fileStream = fs.createReadStream(filePath);

  fileStream.on("open", () => {
    resource.set("Content-Type", fileType);
    fileStream.pipe(resource);
    fs.unlink(request.global.gifPath, _=>_);
    fs.unlink(request.global.gifPath.split('.')[0], _=>_);
  });

  fileStream.on("error", () => {
    resource.set("Content-Type", "text/plain");
    resource.status(404);
    resource.send("Not found");
    fs.unlink(request.global.gifPath, _=>_);
    fs.unlink(request.global.gifPat.split('.')[0], _=>_);
  });
};

app.use(require("cors")());

app.get("/", (request, resource, next) => {
  resource.status(200);
  resource.sendFile(path.join(__dirname, "index.html"));
});

app.post("/optimise",
  uploadGif.single("gif"),
  (request, resource, next) => {
    let compressedGifPath = `${request.file.path}.gif`;
    execFile(gifsicle, [
      "-o", compressedGifPath,
      "--colors",  16,
      "--flip-horizontal",
      request.file.path,
    ], (error, data) => {
      if (error) { throw new Error(error); }
      (request.global || (request.global = {})).gifPath = compressedGifPath;
      next();
    });
  },
  sendGif,
);

app.get("*", (request, resource, next) => {
  resource.status(404);
  resource.send("<h1>404</h1>");
});

app.post("*", (request, resource, next) => {
  resource.status(404);
  resource.send("<h1>404</h1>");
});

app.listen(3000, () => {
  console.log(3000);
});
