class ModalElement {
	constructor(id) {
		this.id = id;
		this.overlay = true;
		this.title = "";
		this.content = "";
	}

	async show(template = "view/modal.html") {
		const modalId = `#modal-${this.id}`;
		const modal = $(modalId);

		if (modal.is(":visible")) {
			this.close();
			return;
		}

		await this.getContent(template);
		await modal.slideDown("slow").promise();

		const closeModal = () => this.close();
		const closeOnKey = (event) => {
			if (["Escape", " ", "Enter"].includes(event.key)) {
				closeModal();
			}
		};

		const modalButtons = document.getElementsByClassName(`modal-ok`);

		for (let i = 0; i < modalButtons.length; i++) {
			modalButtons[i].addEventListener("click", closeModal);
		}

		window.addEventListener("keydown", closeOnKey);
	}

	async getContent(template = "view/modal.html") {
		const prom = await Tpl.loadFile(template);
		Tpl.setIf("overlay", this.overlay);
		Tpl.setVar("title", this.title);
		Tpl.setVar("id", this.id);
		Tpl.setVar("content", this.content);
		const content = Tpl.render(prom);
		$("body").append(content);
	}

	close() {
		const modalId = `#modal-${this.id}`;
		const modal = $(modalId);
		const overlay = $(`#overlay-${this.id}`);

		modal.animate({ opacity: "hide" }, 300);
		overlay.animate({ opacity: "hide" }, 300, () => {
			modal.remove();
			overlay.remove();
		});
	}
}

class ModalMgr {
	constructor() {
		this.arrModal = [];
	}

	newModal(id) {
		const m = new ModalElement(id);
		this.arrModal.push(m);
		return m;
	}
}
