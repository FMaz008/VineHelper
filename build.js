const archiver = require("archiver");
const fs = require("fs");
const pkg = require("./package.json");

console.log("Building...");
fs.rmSync("./dist", { recursive: true, force: true });
fs.mkdirSync("./dist/node_modules/jquery/dist", { recursive: true });

fs.cpSync("./page/", "./dist/page/", { recursive: true });
fs.cpSync("./popup/", "./dist/popup/", { recursive: true });
fs.cpSync("./resource/", "./dist/resource/", { recursive: true });
fs.cpSync("./scripts/", "./dist/scripts/", { recursive: true });
fs.cpSync("./view/", "./dist/view/", { recursive: true });
fs.cpSync("./node_modules/jquery/dist/jquery.min.js", "./dist/node_modules/jquery/dist/jquery.min.js");
fs.cpSync("./node_modules/vine-styling/", "./dist/node_modules/vine-styling/", { recursive: true });

const platforms = ["firefox", "chrome"];

function createArchive(platform, pkg) {
	console.log(`Building ${platform} extension...`);
	fs.cpSync(`./manifest_${platform}.json`, "./dist/manifest.json");

	return new Promise((resolve, reject) => {
		const output = fs.createWriteStream(__dirname + `/VH-${platform}-${pkg.version}.zip`);
		const archive = archiver("zip", {
			zlib: { level: 9 },
		});

		output.on("close", () => {
			resolve();
		});

		archive.on("error", (err) => {
			reject(err);
		});

		archive.pipe(output);
		archive.directory("./dist/", false);
		archive.finalize();
	});
}

// Function to create archives sequentially
function createArchivesSequentially(platforms, pkg) {
	return platforms.reduce((promiseChain, platform) => {
		return promiseChain
			.then(() => {
				return createArchive(platform, pkg);
			})
			.then(() => {
				console.log(`Archive for ${platform} created successfully`);
			});
	}, Promise.resolve());
}

// Create archives sequentially
createArchivesSequentially(platforms, pkg)
	.then(() => {
		console.log("Cleaning up...");
		fs.rmSync("./dist", { recursive: true });

		console.log("Complete!");
	})
	.catch((err) => {
		console.error("Error:", err);
	});
