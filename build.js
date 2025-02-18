const archiver = require("archiver");
const fs = require("fs");
const pkg = require("./package.json");

(async () => {
	console.log("Building...");
	fs.rmSync("./dist", { recursive: true, force: true });
	fs.cpSync("./page/", "./dist/page/", { recursive: true });
	fs.cpSync("./popup/", "./dist/popup/", { recursive: true });
	fs.cpSync("./resource/", "./dist/resource/", { recursive: true });
	fs.cpSync("./scripts/", "./dist/scripts/", { recursive: true });
	fs.cpSync("./view/", "./dist/view/", { recursive: true });
	fs.mkdirSync("./dist/node_modules/socket.io/client-dist", { recursive: true });
	fs.cpSync(
		"./node_modules/socket.io/client-dist/socket.io.min.js",
		"./dist/node_modules/socket.io/client-dist/socket.io.min.js"
	);
	fs.cpSync(
		"./node_modules/socket.io/client-dist/socket.io.min.js.map",
		"./dist/node_modules/socket.io/client-dist/socket.io.min.js.map"
	);
	fs.cpSync("./node_modules/vine-styling/", "./dist/node_modules/vine-styling/", { recursive: true });
	fs.cpSync("./node_modules/@kurkle\\color/", "./dist/node_modules/@kurkle\\color/", { recursive: true });
	const platforms = ["firefox", "chrome", "ios"];
	for (const platform of platforms) {
		console.log(`Building ${platform} extension...`);
		fs.cpSync(`./manifest_${platform}.json`, "./dist/manifest.json");
		const output = fs.createWriteStream(__dirname + `/VH-${platform}-${pkg.version}.zip`);
		const archive = archiver("zip", {
			zlib: { level: 9 },
		});

		await new Promise((resolve) => {
			output.on("close", () => {
				resolve();
			});

			archive.pipe(output);
			archive.directory("./dist/", false);
			archive.finalize();
		});
	}

	console.log("Cleaning up...");
	fs.rmSync("./dist", { recursive: true });

	console.log("Complete!");
})();
