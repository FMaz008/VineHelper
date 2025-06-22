import { NotificationMonitorV2 } from "../scripts/notifications-monitor/core/NotificationMonitorV2.js";
const NotifMon = new NotificationMonitorV2();
NotifMon.initialize();

//If browser is firefox, load icon_firefox.css
if (navigator.userAgent.includes("Firefox")) {
	document.head.innerHTML += `<link rel="stylesheet" type="text/css" href="../resource/css/icon_firefox.css" />`;
}
//If the browser is chrome, load icon_chrome.css
if (navigator.userAgent.includes("Chrome") || navigator.userAgent.includes("Chromium")) {
	document.head.innerHTML += `<link rel="stylesheet" type="text/css" href="../resource/css/icon_chrome.css" />`;
}
if (navigator.userAgent.includes("Safari")) {
	document.head.innerHTML += `<link rel="stylesheet" type="text/css" href="../resource/css/icon_ios.css" />`;
}
