var arrTemplate = [];

async function loadSettings() {
	var data;
	//If no template exist already, create an empty array
	data = await chrome.storage.local.get("reviews_templates");
	if (data == null || Object.keys(data).length === 0) {
		await chrome.storage.local.set({ reviews_templates: [] });
	} else {
		Object.assign(arrTemplate, data.reviews_templates);
	}

	console.log(arrTemplate);
	if (arrTemplate.length > 0) {
		arrTemplate.forEach((tpl) => {
			document
				.getElementById("templates_list")
				.insertAdjacentHTML(
					"beforeend",
					"<tr><td></td>" +
						tpl.title +
						"<td><button id='" +
						tpl.id +
						"' class='edit'>Edit</button><button id='" +
						tpl.id +
						"'  class='delete'>Delete</button></td></tr>"
				);
		});
	}

	var element;

	//Add listener for new
	element = document.getElementById("new");
	element.addEventListener("click", function () {
		document.getElementById("editTitle").innerHTML = "Create new template";
		document.getElementById("template_id").value = "new";
		document.getElementById("template_title").value = "";
		document.getElementById("template_content").value = "";
	});

	//Add listener for edit
	const editElements = document.querySelectorAll("button.edit");
	editElements.forEach((element) => {
		element.addEventListener("click", async function () {
			let template = await getTemplate(element.id);
			console.log(template);
			document.getElementById("editTitle").innerHTML = "Edit template";
			document.getElementById("template_id").value = element.id;
			document.getElementById("template_title").value = template.title;
			document.getElementById("template_content").value =
				template.content;
		});
	});

	//Add listener for delete
	const deleteElements = document.querySelectorAll("button.delete");
	deleteElements.forEach((element) => {
		element.addEventListener("click", function () {
			if (confirm("Delete this template?")) {
				deleteTemplate(element.id);
			}
		});
	});

	//Add listener for save
	element = document.getElementById("save");
	element.addEventListener("click", function () {
		if (document.getElementById("template_id").value == "new") {
			createNewTemplate(
				document.getElementById("template_title").value,
				document.getElementById("template_content").value
			);
		} else {
			editNewTemplate(
				document.getElementById("template_id").value,
				document.getElementById("template_title").value,
				document.getElementById("template_content").value
			);
		}
	});
}

loadSettings();

async function getTemplate(id) {
	for (let i = 0; i < arrTemplate.length; i++) {
		if (arrTemplate[i].id == id) {
			return arrTemplate[i];
		}
	}
	return null;
}

async function deleteTemplate(id) {
	for (let i = 0; i < arrTemplate.length; i++) {
		if (arrTemplate[i].id == id) {
			arrTemplate.splice(i, 1);
			await chrome.storage.local.set({ reviews_templates: arrTemplate });
			location.reload();
			return;
		}
	}
}

async function createNewTemplate(title, content) {
	let id = crypto.randomUUID();
	arrTemplate.push({ id: id, title: title, content: content });
	await chrome.storage.local.set({ reviews_templates: arrTemplate });

	location.reload();
}

async function editNewTemplate(id, title, content) {
	for (let i = 0; i < arrTemplate.length; i++) {
		if (arrTemplate[i].id == id) {
			arrTemplate[i] = { id: id, title: title, content: content };
			await chrome.storage.local.set({ reviews_templates: arrTemplate });
			location.reload();
			return;
		}
	}
}
