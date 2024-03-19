if (typeof browser === "undefined") {
	var browser = chrome;
}

var arrTemplate = [];

async function loadSettings() {
	var data;
	//If no template exist already, create an empty array
	data = await browser.storage.local.get("reviews_templates");
	if (data == null || Object.keys(data).length === 0) {
		await browser.storage.local.set({ reviews_templates: [] });
	} else {
		Object.assign(arrTemplate, data.reviews_templates);
	}

	console.log(arrTemplate);

	if (arrTemplate.length > 0) {
		arrTemplate.forEach((tpl) => {
			const tableBody = document.getElementById("templates_list").querySelector('tbody'); 
			const row = tableBody.insertRow();
			const actionCell = row.insertCell();
			const titleCell = row.insertCell(); 

			actionCell.innerHTML = `
			<button id="${tpl.id}" class='edit'>Edit</button>
			<button id="${tpl.id}" class='delete'>Delete</button>
			`;
			titleCell.textContent = `${JSON.parse(tpl.title)}`;
		});
	}

	var element;

	//Add listener for new
	
	element = document.getElementById("reset");
	element.addEventListener("click", function () {
		document.getElementById("editTitle").innerHTML = "New template";
		document.getElementById("template_id").value = "new";
	});
	

	//Add listener for edit
	const editElements = document.querySelectorAll("button.edit");
	editElements.forEach((element) => {
		element.addEventListener("click", async function () {
			let template = await getTemplate(element.id);
			console.log(template);
			document.getElementById("editTitle").innerHTML = "Edit template";
			document.getElementById("template_id").value = element.id;
			document.getElementById("template_title").value = JSON.parse(template.title);
			document.getElementById("template_content").value =
				JSON.parse(template.content);
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
		if (document.getElementById("template_id").value == "new" && document.getElementById("template_title").value !== '' && document.getElementById("template_content").value !== '') {
			createNewTemplate(
				JSON.stringify(document.getElementById("template_title").value),
				JSON.stringify(document.getElementById("template_content").value)
			);
		} else {
			editNewTemplate(
				document.getElementById("template_id").value,
				JSON.stringify(document.getElementById("template_title").value),
				JSON.stringify(document.getElementById("template_content").value)
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
			await browser.storage.local.set({ reviews_templates: arrTemplate });
			location.reload();
			return;
		}
	}
}

async function createNewTemplate(title, content) {
	let id = crypto.randomUUID();
	arrTemplate.push({ id: id, title: title, content: content });
	await browser.storage.local.set({ reviews_templates: arrTemplate });

	location.reload();
}

async function editNewTemplate(id, title, content) {
	for (let i = 0; i < arrTemplate.length; i++) {
		if (arrTemplate[i].id == id) {
			arrTemplate[i] = { id: id, title: title, content: content };
			await browser.storage.local.set({ reviews_templates: arrTemplate });
			location.reload();
			return;
		}
	}
}
