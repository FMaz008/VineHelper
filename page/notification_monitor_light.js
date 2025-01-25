import { SettingsMgr } from "../scripts/SettingsMgr.js";
const Settings = new SettingsMgr();

import { NotificationMonitor } from "../scripts/NotificationMonitor.js";
const NotifMon = new NotificationMonitor();
NotifMon.initializeLight();
