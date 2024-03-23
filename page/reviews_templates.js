if (typeof browser === "undefined") {
	var browser = chrome;
}
var scriptName = "reviews_templates.js";

function logError(errorArray) {
	const [functionName, scriptName, error] = errorArray;
	console.error(`${scriptName}-${functionName} generated the following error: ${error.message}`);
} // testing common console error, this could just be a debug message, but if debug or the script files the console won't

var reviewTemplates = [];

async function loadSettings() {
	try {
		let templateSet = await browser.storage.local.get("reviews_templates");
		let reviews_templates = templateSet?.reviews_templates ?? []; //Nullish coalescing & Optional chaining prevents undefined without extra code
		if (Object.keys(reviews_templates).length === 0) {
			await browser.storage.local.set({ reviews_templates: [] });
		}
		reviewTemplates = reviews_templates;
		console.log(reviewTemplates);
		if (reviewTemplates.length) {
			loadTemplates();
		}
	} catch (e) {
		logError([scriptName, "loadSettings", e.message]);
	}
}

function loadTemplates() {
	try {
		const tableBody = document.getElementById("templates_list").querySelector("tbody");

		if (reviewTemplates.length > 0) {
			reviewTemplates.forEach((template) => {
				let { id, title } = template;

				const row = tableBody.insertRow();
				const actionCell = row.insertCell();
				const titleCell = row.insertCell();
				row.id = id;

				actionCell.innerHTML = `
			<button id="edit" data-id="${id}" class='vh-button'>Edit</button>
			<button id="delete" data-id="${id}" class='vh-button'>Delete</button>
			`;
				titleCell.textContent = `${JSON.parse(title)}`;
			});
		}
	} catch (e) {
		logError(["loadSettings", scriptName, e]);
	}
}

function getTemplate(id) {
	try {
		return reviewTemplates.find((template) => template.id === id);
	} catch (e) {
		logError(["getTemplate", scriptName, e.message]);
	}
}

async function handleSaveClick() {
	try {
		const title = document.getElementById("template_title").value.trim();
		const content = document.getElementById("template_content").value.trim();
		const templateId = document.getElementById("template_id").value;
		if (!title || !content) return;

		if (templateId !== "new") {
			updateTemplate(templateId, title, content);
		} else {
			newTemplate(title, content);
		}
	} catch (e) {
		logError(["handleSaveClick", scriptName, e.message]);
	}
}

async function handleResetClick() {
	try {
		document.getElementById("form_action").innerHTML = "New template";
		document.getElementById("template_id").value = "new";
	} catch (e) {
		logError(["handleResetClick", scriptName, e.message]);
	}
}

async function handleEditClick(id) {
	try {
		const template = getTemplate(id);
		if (template) {
			let { content, title, id } = template;
			document.getElementById("form_action").innerHTML = "Edit template";
			document.getElementById("template_id").value = id;
			document.getElementById("template_title").value = JSON.parse(title);
			document.getElementById("template_content").value = JSON.parse(content);
		}
	} catch (e) {
		logError(["handleEditClick", scriptName, e.message]);
	}
}

async function handleDeleteClick(id) {
	try {
		if (confirm("Delete this template?")) {
			await deleteTemplate(id);
		}
	} catch (e) {
		logError(["handleDeleteClick", scriptName, e.message]);
	}
}

const events = {
	edit: handleEditClick,
	delete: handleDeleteClick,
	save: handleSaveClick,
	reset: handleResetClick,
};

document.addEventListener("click", (event) => {
	const { target } = event;
	if (target.tagName !== "BUTTON") return;
	const eventHandler = events[target.id];
	if (eventHandler) {
		eventHandler(target.dataset.id);
	}
});

async function deleteTemplate(id) {
	console.log(id);

	try {
		const index = reviewTemplates.findIndex((template) => template.id === id);
		const filteredTemplates = reviewTemplates.filter((template, i) => i !== index);
		await browser.storage.local.set({ reviews_templates: filteredTemplates });
		location.reload();
	} catch (e) {
		logError(["deleteTemplate", scriptName, e.message]);
	}
}

async function newTemplate(title, content) {
	try {
		reviewTemplates.push({
			id: crypto.randomUUID(),
			title: JSON.stringify(title),
			content: JSON.stringify(content),
		});
		await browser.storage.local.set({ reviews_templates: reviewTemplates });
		location.reload();
	} catch (e) {
		logError(["createNewTemplate", scriptName, e.message]);
	}
}

async function updateTemplate(id, title, content) {
	try {
		const index = reviewTemplates.findIndex((template) => template.id === id);
		reviewTemplates[index] = { id: id, title: JSON.stringify(title), content: JSON.stringify(content) };
		await browser.storage.local.set({ reviews_templates: reviewTemplates });
		location.reload();
	} catch (e) {
		logError(["editNewTemplate", scriptName, e.message]);
	}
}

window.addEventListener("DOMContentLoaded", function () {
	loadSettings();
});
