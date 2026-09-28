import { useState, useEffect, useCallback } from "react";

export type Language = "en" | "id";

export const LANGUAGE_STORAGE_KEY = "arunaki_language";

export const translations = {
  en: {
    // Menu Bar
    file: "File",
    edit: "Edit",
    view: "View",
    help: "Help",

    // File Menu
    newSession: "New Session",
    openFolder: "Open Folder...",
    saveDocument: "Save Document",
    backupWorkspace: "Backup Workspace",
    closeFolder: "Close Folder",
    preferencesSettings: "Preferences / Settings",
    exitWindow: "Exit Window",

    // Edit Menu
    undo: "Undo",
    redo: "Redo",
    cut: "Cut",
    copy: "Copy",
    paste: "Paste",
    selectAll: "Select All",
    findInSession: "Find in Session...",
    keyboardShortcuts: "Keyboard Shortcuts",

    // View Menu
    explorerPanel: "Explorer Panel",
    chatPanel: "Chat Panel",
    wrapText: "Wrap Text",
    wordWrap: "Word Wrap",
    theme: "Theme",
    light: "Light",
    dark: "Dark",
    systemTheme: "System Theme",
    language: "Language",
    english: "English",
    indonesian: "Bahasa Indonesia",
    toggleFullscreen: "Toggle Fullscreen",
    resetZoom: "Reset Zoom",

    // Help Menu
    knowledgeRules: "Knowledge & Rules",
    documentation: "Documentation",
    githubRepo: "GitHub Repository",
    reportIssue: "Report an Issue",
    aboutArunaki: "About Arunaki",
    about: "About",

    // Settings Navigation
    settingsTitle: "Workstation System Settings",
    settingsSubtitle: "Configure model routing, desktop office automation behavior, and user account licensing.",
    modelRouting: "Model Routing & Providers",
    desktopAutomation: "Desktop Automation & Office",
    messagingApps: "Messaging Apps",
    accountLicense: "Account & License",

    // Common Actions
    saveChanges: "Save Changes",
    saving: "Saving...",
    setupGuide: "Setup Guide",
    refresh: "Refresh",
    connected: "Connected",
    inactive: "Inactive",
    connecting: "Connecting...",
    warning: "Warning",
    testToken: "Test Token",
    useActiveFolder: "Use Active Workspace Folder",

    // Messaging Tab
    messagingSubtitle: "Control Arunaki remotely from Telegram. Forward WhatsApp messages, raw notes, or document tasks to your bot, and Arunaki executes them locally on this computer.",
    telegramGateway: "Telegram BYOB Gateway",
    telegramGatewayDesc: "Direct outward long-polling connection from your PC to Telegram. Free, private, and zero VPS hosting required.",
    botTokenLabel: "Telegram Bot Token",
    botTokenHelp: "Need a token? View guide",
    botTokenPlaceholder: "e.g. 1234567890:ABCdefGhIJKlmNoPQRsTUVwxyZ",
    whitelistLabel: "Allowed Sender Whitelist (Security)",
    whitelistHelp: "How to check my Telegram ID",
    whitelistPlaceholder: "e.g. 123456789, @username (or * for all)",
    whitelistDesc: "Protects your computer. Only Telegram accounts registered in this whitelist can execute document instructions.",
    targetFolderLabel: "Target Project Folder",
    targetFolderDesc: "The directory on this computer where Arunaki will read, modify, and create document files when receiving instructions from Telegram.",

    // Setup Guide Modal
    guideModalTitle: "Telegram Bot Setup Guide",
    guideModalSubtitle: "Connect your Telegram bot in 4 simple steps (takes 2-3 minutes)",
    step1Title: "1. Create Bot",
    step2Title: "2. Copy Token",
    step3Title: "3. Whitelist ID",
    step4Title: "4. Ready",
    previous: "Previous",
    next: "Next",
    doneClose: "Done & Close Guide",

    // Setup Guide Steps Content
    step1Badge: "Step 1 of 4",
    step1Link: "Open @BotFather on Telegram",
    step1Heading: "Create a New Bot via @BotFather",
    step1Desc1: "1. Open Telegram on your phone or desktop, and search for the official bot creator: ",
    step1Desc1Or: "(or click the link above).",
    step1Desc2: "2. Send the command: ",
    step1Desc3: "3. Give your bot any display name (e.g. My Document Assistant), then enter a username ending in bot (e.g. arunaki_work_bot).",
    copyCommand: "Copy command",

    step2Badge: "Step 2 of 4",
    step2Sub: "API Token",
    step2Heading: "Copy the HTTP API Token",
    step2Desc1: "After you specify a username, @BotFather will reply with your bot token:",
    step2Example: "Example message from BotFather:",
    step2UseToken: "Use this token to access the HTTP API:",
    step2Desc2: "Copy the entire token string and paste it into the Telegram Bot Token field on the settings page.",

    step3Badge: "Step 3 of 4",
    step3Link: "Open @userinfobot on Telegram",
    step3Heading: "Whitelist Your Telegram Account (Security)",
    step3DescPrefix: "To make sure only you can control Arunaki on your PC:",
    step3Desc1: "1. Open @userinfobot on Telegram (click the link above).",
    step3Desc2: "2. Send any message or click /start. The bot will reply with your numeric User ID (e.g. 123456789).",
    step3Desc3: "3. Copy this number and paste it into the Allowed Sender Whitelist field.",

    step4Badge: "Final Step",
    step4Sub: "Ready to Use!",
    step4Heading: "Save & Start Messaging",
    step4Desc1: "1. Make sure the toggle switch is ON, then click Save Changes.",
    step4Desc2: "2. Open your new bot on Telegram from your phone, and send /start.",
    step4Desc3: "3. Forward any WhatsApp note or type a document instruction, such as:",
    step4Example: '"rekap catatan penjualan ini ke file rekap.xlsx"',
    step4Success: "Arunaki on your PC will automatically process the document and reply back to your phone.",

    // Test Token Messages
    tokenValidConnected: "Token is valid! Connected to",
    failedVerifyToken: "Failed to verify token.",

    // Main Navigation Tabs
    navWorkstation: "Workstation",
    navKnowledge: "Knowledge",
    navHistory: "History",
    navSettings: "Settings",

    // Footer & Status Bar
    noFolderOpened: "No folder opened",
    online: "Online",
    offline: "Offline",
    networkConnected: "Network connected",
    networkOffline: "Network offline",
    switchToDark: "Switch to Dark Mode",
    switchToLight: "Switch to Light Mode",
    userProfileSettings: "User Profile & Settings",

    // Workstation Explorer
    explorer: "Explorer",
    refreshExplorer: "Refresh Explorer",
    closeFolderTooltip: "Close Folder",
    closeExplorer: "Close Explorer",
    openExplorer: "Open Explorer Panel",
    failedToReadFolder: "Failed to read folder",
    tryAgain: "Try again",
    recentCanvases: "Recent Documents",

    // Workstation Chat
    chat: "Chat",
    newChat: "New Chat",
    sessionNamePlaceholder: "Session Name...",
    clickToRenameSession: "Click to rename session",
    newChatSession: "New Chat Session",
    closePanel: "Close Panel",
    askPlaceholder: "Ask anything, type @ to mention files, / for commands...",
    reasoningEffort: "Reasoning Effort",
    effortDefault: "Default",
    effortLow: "Low",
    effortMedium: "Medium",
    effortHigh: "High",
    addToQueue: "Add to queue",
    stopGenerating: "Stop generating",
    selectFileToAttach: "Select file to attach",
    attachFile: "Attach file or image",
    attach: "Attach",
    slashCommands: "Slash Commands",
    imageAttached: "Image attached",
    workWithAgent: "Work with Agent",
    thinking: "Thinking...",
    executingTasks: "Executing document tasks",

    // Modals
    aboutDesktopTitle: "Arunaki Desktop",
    aboutSubtitle: "Sandboxed Computer Use Agent for Documents",
    version: "Version",
    environment: "Environment",
    isolation: "Isolation",
    activeFolderSandbox: "Active Folder Sandbox",
    done: "Done",
    searchShortcuts: "Search shortcuts...",
    resetAllShortcuts: "Reset All",
    pressDesiredKeys: "Press desired key combo...",

    // Model Provider Settings & Routing
    modelRoutingCatalogTitle: "Language Model Routing & Provider Catalogs",
    modelRoutingCatalogSubtitle: "Manage provider credentials, API endpoints, and fallback model priority order.",
    addProvider: "Add Provider",
    automaticFallbackTitle: "Automatic Fallback Routing",
    automaticFallbackDesc: "When executing document tasks, Arunaki routes to the primary active model. If an endpoint encounters rate limits or errors, it automatically falls back sequentially to subsequent models in the pool without interrupting your workflow.",
    loadingProviders: "Loading provider configurations...",
    noProvidersConfigured: "No model providers configured yet.",
    addFirstProvider: "+ Add First Provider",

    // Provider Card
    moveProviderUp: "Move provider up in routing priority",
    moveProviderDown: "Move provider down in routing priority",
    primaryActive: "Primary Active",
    setPrimary: "Set Primary",
    primaryActiveTooltip: "Primary active provider",
    setPrimaryTooltip: "Set as primary routing provider",
    defaultEndpoint: "Default Endpoint",
    modelPool: "Model Pool",
    testPing: "Test Ping",
    testing: "Testing...",
    configure: "Configure",
    deleteProvider: "Delete provider",
    clickToViewPing: "Click to view ping payload & LLM response details",
    failed: "Failed",
    pingInspectionDetails: "Live Ping Inspection Details",
    promptSent: "Prompt Sent:",
    llmReplyReceived: "LLM Reply Received:",
    latency: "Latency:",
    status: "Status:",
    endpoint: "Endpoint:",

    // Provider Form
    configureProvider: "Configure Provider",
    addNewProviderConnection: "Add New Provider Connection",
    noEndpointSpecified: "No endpoint specified",
    selectActiveModels: "Select Active Models & Routing",
    endpointCredentials: "Endpoint & Credentials",
    providerType: "Provider Type",
    displayName: "Display Name",
    baseUrlEndpoint: "Base URL / Endpoint",
    apiKeyToken: "API Key / Token",
    apiKeyPlaceholder: "sk-... (Leave blank if local gateway)",
    activeModelRoutingPriority: "Active Model Routing Priority",
    selectedCount: "selected",
    dragDotsOrArrows: "Drag dots or use arrows to adjust priority order",
    primary: "Primary",
    fallback: "Fallback",
    availableModels: "Available Models",
    filterModels: "Filter Models",
    allModels: "All Models",
    freeModelsOnly: "Free Models Only",
    selectedInPool: "Selected in Pool",
    modelFamilies: "Model Families",
    selectAllFree: "Select All Free",
    searchModels: "Search models...",
    syncFromApi: "Sync from API",
    syncing: "Syncing...",
    resetFilters: "Reset Filters",
    clickToSelect: "Click to select",
    customModel: "+ Custom Model",
    add: "Add",
    testConnection: "Test Connection",
    testingPing: "Testing Ping...",
    cancel: "Cancel",
    saveProvider: "Save Provider",

    // Automation Tab
    desktopAutomationTitle: "Desktop Automation & OS Behavior",
    desktopAutomationSubtitle: "Configure desktop Office automation (Word, Excel, PowerPoint), document application interaction, and operating system notifications.",
    launchOfficeTitle: "Launch Microsoft Office on Edit",
    launchOfficeDesc: "Opens native desktop Office applications (Word, Excel, PowerPoint, etc.) visibly on screen when executing document tasks. If disabled, all document modifications are performed silently in headless background mode.",
    autoBackupTitle: "Automatic Snapshot Backup Before Modifications",
    autoBackupDesc: "Creates an immutable local backup (.bak) in .arunaki/backups/ before mutating files for 100% data recovery.",
    desktopNotificationsTitle: "Desktop OS Notifications",
    desktopNotificationsDesc: "Displays native desktop notifications when document and ledger tasks complete.",
    testDesktopNotification: "Test Desktop Notification",
    electronShellTitle: "Electron Native Desktop Shell",
    electronShellDesc: "Native OS filesystem, window overlay, and IPC bridge",

    // Account Tab
    userAccountLicenseTitle: "User Account & License",
    userAccountLicenseSubtitle: "Manage your workstation profile, encrypted cloud sync, and multi-device workstation license.",
    proLicense: "Pro License",
    fullNameBusiness: "Full Name / Business Identity",
    save: "Save",
    signOut: "Sign Out",
    licenseDetails: "License Details",
    verificationStatus: "Verification Status",
    activeVerified: "Active & Verified",
    connectedClient: "Connected Client",
    windowsDesktopWorkstation: "Windows Desktop Workstation",
    cloudWorkspaceSync: "Cloud Workspace Sync",
    aesEncryption: "AES-256 local encryption",
    active: "Active",
    createAccount: "Create New Arunaki Account",
    signInAccount: "Sign In to Arunaki",
    createAccountDesc: "Register to enable workspace cloud synchronization and multi-device pro licensing.",
    signInAccountDesc: "Connect your account to synchronize workspace configurations across devices.",
    continueGoogle: "Continue with Google",
    continueGithub: "Continue with GitHub",
    orContinueEmail: "or continue with email",
    emailAddress: "Email Address",
    password: "Password",
    registerAndSignIn: "Register & Sign In",
    signIn: "Sign In",
    alreadyHaveAccount: "Already have an account? Sign In",
    dontHaveAccount: "Don't have an account? Register",
    privacyGuaranteeTitle: "Privacy & Offline Guarantee:",
    privacyGuaranteeDesc: "Arunaki operates fully offline in local mode without requiring an active account or internet login.",

    // Spreadsheet & Canvas Viewer
    openInExcel: "Open in Excel",
    openInExcelNative: "Open in Microsoft Excel",
    openInExcelTooltip: "Open this document directly in native Microsoft Excel desktop application",
    copyCsv: "Copy CSV",
    copiedCsv: "Copied",
    copyCsvTooltip: "Copy this sheet content as CSV to clipboard",
    searchInSheet: "Search in sheet...",
    rowsLabel: "rows",
    colsLabel: "cols",
    emptyCell: "Empty",
    nonDestructiveEmbedTooltip: "File opened safely in memory (read-only) without modifying original Excel OOXML format.",
    spreadsheetBinaryNotice: "Binary spreadsheet loaded. You can open it directly in desktop Microsoft Excel or verify its contents.",
    sheetsLabel: "Sheets:",
    openInCanvas: "Open in Canvas",
    openInCanvasTooltip: "Open this table in the Center Canvas Panel",
    tableOpenedInCanvas: "Table opened in Canvas panel",
    dataTableLabel: "Data Table",
  },
  id: {
    // Menu Bar
    file: "Berkas",
    edit: "Edit",
    view: "Tampilan",
    help: "Bantuan",

    // File Menu
    newSession: "Sesi Baru",
    openFolder: "Buka Folder...",
    saveDocument: "Simpan Dokumen",
    backupWorkspace: "Cadangkan Ruang Kerja",
    closeFolder: "Tutup Folder",
    preferencesSettings: "Pengaturan / Preferensi",
    exitWindow: "Keluar",

    // Edit Menu
    undo: "Urungkan",
    redo: "Ulangi",
    cut: "Potong",
    copy: "Salin",
    paste: "Tempel",
    selectAll: "Pilih Semua",
    findInSession: "Cari di Sesi...",
    keyboardShortcuts: "Pintasan Keyboard",

    // View Menu
    explorerPanel: "Panel Berkas",
    chatPanel: "Panel Percakapan",
    wrapText: "Bungkus Teks (Wrap Text)",
    wordWrap: "Word Wrap",
    theme: "Tema Tampilan",
    light: "Terang",
    dark: "Gelap",
    systemTheme: "Ikuti Sistem",
    language: "Bahasa",
    english: "English",
    indonesian: "Bahasa Indonesia",
    toggleFullscreen: "Layar Penuh",
    resetZoom: "Reset Zoom",

    // Help Menu
    knowledgeRules: "Pengetahuan & Aturan",
    documentation: "Dokumentasi",
    githubRepo: "Repositori GitHub",
    reportIssue: "Laporkan Masalah",
    aboutArunaki: "Tentang Arunaki",
    about: "Tentang",

    // Settings Navigation
    settingsTitle: "Pengaturan Sistem Workstation",
    settingsSubtitle: "Atur routing model AI, perilaku otomasi Microsoft Office desktop, dan lisensi akun pengguna.",
    modelRouting: "Routing Model & Provider",
    desktopAutomation: "Otomasi Desktop & Office",
    messagingApps: "Aplikasi Pesan (Messaging)",
    accountLicense: "Akun & Lisensi",

    // Common Actions
    saveChanges: "Simpan Perubahan",
    saving: "Menyimpan...",
    setupGuide: "Panduan Setup",
    refresh: "Muat Ulang",
    connected: "Terhubung",
    inactive: "Nonaktif",
    connecting: "Menghubungkan...",
    warning: "Peringatan",
    testToken: "Test Token",
    useActiveFolder: "Gunakan Folder Aktif",

    // Messaging Tab
    messagingSubtitle: "Kendalikan Arunaki langsung dari Telegram di HP Anda. Kirim rekapan, forward pesan WhatsApp, atau catatan mentah ke bot Telegram Anda, dan Arunaki di laptop akan mengeksekusinya otomatis.",
    telegramGateway: "Telegram Bot Pribadi (BYOB)",
    telegramGatewayDesc: "Koneksi langsung dari PC ke Telegram. 100% aman, gratis, dan tidak butuh sewa server VPS.",
    botTokenLabel: "Token Bot Telegram",
    botTokenHelp: "Belum punya token? Lihat caranya",
    botTokenPlaceholder: "Contoh: 1234567890:ABCdefGhIJKlmNoPQRsTUVwxyZ",
    whitelistLabel: "ID Pengguna Telegram yang Diizinkan (Keamanan)",
    whitelistHelp: "Cara cek ID Telegram saya",
    whitelistPlaceholder: "Contoh: 123456789, @juliosiringo (atau * untuk semua)",
    whitelistDesc: "Mencegah orang asing mengendalikan PC Anda. Hanya akun Telegram di daftar ini yang direspon oleh Arunaki.",
    targetFolderLabel: "Folder Proyek Tujuan di Komputer",
    targetFolderDesc: "Folder tempat Arunaki akan membaca, membuat, dan mengedit berkas (Excel, Word, catatan) saat menerima perintah dari Telegram.",

    // Setup Guide Modal
    guideModalTitle: "Panduan Cepat: Menghubungkan Telegram ke Arunaki",
    guideModalSubtitle: "Ikuti 4 langkah mudah ini (hanya butuh 2-3 menit sekali saja)",
    step1Title: "1. Buat Bot",
    step2Title: "2. Salin Token",
    step3Title: "3. Cek ID Saya",
    step4Title: "4. Selesai",
    previous: "Sebelumnya",
    next: "Lanjut",
    doneClose: "Selesai & Tutup Panduan",

    // Setup Guide Steps Content
    step1Badge: "Langkah 1 dari 4",
    step1Link: "Buka @BotFather di Telegram",
    step1Heading: "Buat Bot Baru lewat @BotFather",
    step1Desc1: "1. Buka aplikasi Telegram di HP atau laptop, lalu cari akun resmi pembuat bot: ",
    step1Desc1Or: "(atau klik tautan di atas).",
    step1Desc2: "2. Kirim perintah: ",
    step1Desc3: "3. Beri nama tampilan bot (contoh: Asisten Dokumen), lalu tentukan username yang berakhiran bot (contoh: arunaki_work_bot).",
    copyCommand: "Salin perintah",

    step2Badge: "Langkah 2 dari 4",
    step2Sub: "Token API",
    step2Heading: "Salin Token HTTP API",
    step2Desc1: "Setelah username bot ditentukan, @BotFather akan membalas dengan token bot Anda:",
    step2Example: "Contoh balasan dari BotFather:",
    step2UseToken: "Gunakan token ini untuk mengakses HTTP API:",
    step2Desc2: "Salin seluruh baris token tersebut dan tempel (paste) ke kolom Token Bot Telegram di halaman pengaturan ini.",

    step3Badge: "Langkah 3 dari 4",
    step3Link: "Buka @userinfobot di Telegram",
    step3Heading: "Daftarkan Akun Telegram Anda (Keamanan)",
    step3DescPrefix: "Agar hanya Anda yang dapat mengendalikan Arunaki di laptop Anda:",
    step3Desc1: "1. Buka @userinfobot di Telegram (klik tautan di atas).",
    step3Desc2: "2. Kirim pesan apa saja atau klik /start. Bot akan membalas dengan nomor ID Telegram Anda (contoh: 123456789).",
    step3Desc3: "3. Salin angka ID tersebut dan tempel ke kolom ID Pengguna Telegram yang Diizinkan.",

    step4Badge: "Langkah Terakhir",
    step4Sub: "Siap Digunakan!",
    step4Heading: "Simpan & Mulai Kirim Pesan",
    step4Desc1: "1. Pastikan sakelar aktif (ON), lalu klik Simpan Perubahan.",
    step4Desc2: "2. Buka bot baru Anda di Telegram lewat HP, lalu kirim perintah /start.",
    step4Desc3: "3. Teruskan (forward) pesan WhatsApp atau ketik instruksi dokumen, seperti:",
    step4Example: '"rekap catatan penjualan ini ke file rekap.xlsx"',
    step4Success: "Arunaki di laptop Anda akan otomatis memproses dokumen dan membalas langsung ke HP Anda.",

    // Test Token Messages
    tokenValidConnected: "Token valid! Terhubung ke",
    failedVerifyToken: "Gagal memverifikasi token.",

    // Main Navigation Tabs
    navWorkstation: "Workstation",
    navKnowledge: "Pengetahuan",
    navHistory: "Riwayat",
    navSettings: "Pengaturan",

    // Footer & Status Bar
    noFolderOpened: "Tidak ada folder terbuka",
    online: "Online",
    offline: "Offline",
    networkConnected: "Jaringan terhubung",
    networkOffline: "Jaringan terputus",
    switchToDark: "Beralih ke Mode Gelap",
    switchToLight: "Beralih ke Mode Terang",
    userProfileSettings: "Profil Pengguna & Pengaturan",

    // Workstation Explorer
    explorer: "Penjelajah Berkas",
    refreshExplorer: "Muat Ulang Berkas",
    closeFolderTooltip: "Tutup Folder",
    closeExplorer: "Tutup Panel Berkas",
    openExplorer: "Buka Panel Berkas",
    failedToReadFolder: "Gagal membaca folder",
    tryAgain: "Coba lagi",
    recentCanvases: "Dokumen Terakhir",

    // Workstation Chat
    chat: "Percakapan",
    newChat: "Sesi Baru",
    sessionNamePlaceholder: "Nama Sesi...",
    clickToRenameSession: "Klik untuk ganti nama sesi",
    newChatSession: "Sesi Percakapan Baru",
    closePanel: "Tutup Panel",
    askPlaceholder: "Tanyakan apa saja, ketik @ untuk pilih file, / untuk perintah...",
    reasoningEffort: "Tingkat Penalaran",
    effortDefault: "Bawaan",
    effortLow: "Rendah",
    effortMedium: "Sedang",
    effortHigh: "Tinggi",
    addToQueue: "Tambah ke antrean",
    stopGenerating: "Hentikan pembuatan",
    selectFileToAttach: "Pilih berkas untuk dilampirkan",
    attachFile: "Lampirkan berkas atau gambar",
    attach: "Lampirkan",
    slashCommands: "Perintah Cepat (/)",
    imageAttached: "Gambar dilampirkan",
    workWithAgent: "Mulai bekerja dengan agen dokumen",
    thinking: "Sedang berpikir...",
    executingTasks: "Mengeksekusi tugas dokumen",

    // Modals
    aboutDesktopTitle: "Arunaki Desktop",
    aboutSubtitle: "Agen Otomasi Komputer & Dokumen Terisolasi",
    version: "Versi",
    environment: "Lingkungan",
    isolation: "Isolasi",
    activeFolderSandbox: "Sandbox Folder Aktif",
    done: "Selesai",
    searchShortcuts: "Cari pintasan...",
    resetAllShortcuts: "Reset Semua",
    pressDesiredKeys: "Tekan kombinasi tombol...",

    // Model Provider Settings & Routing
    modelRoutingCatalogTitle: "Katalog Provider & Routing Model Bahasa",
    modelRoutingCatalogSubtitle: "Kelola kredensial provider, endpoint API, dan urutan prioritas model cadangan.",
    addProvider: "Tambah Provider",
    automaticFallbackTitle: "Routing Cadangan Otomatis",
    automaticFallbackDesc: "Saat mengeksekusi tugas dokumen, Arunaki mengarahkan ke model aktif utama. Jika endpoint mengalami batasan kuota atau error, sistem otomatis beralih secara berurutan ke model berikutnya dalam daftar tanpa mengganggu alur kerja Anda.",
    loadingProviders: "Memuat konfigurasi provider...",
    noProvidersConfigured: "Belum ada provider model yang dikonfigurasi.",
    addFirstProvider: "+ Tambah Provider Pertama",

    // Provider Card
    moveProviderUp: "Pindahkan prioritas provider ke atas",
    moveProviderDown: "Pindahkan prioritas provider ke bawah",
    primaryActive: "Aktif Utama",
    setPrimary: "Jadikan Utama",
    primaryActiveTooltip: "Provider aktif utama",
    setPrimaryTooltip: "Jadikan provider routing utama",
    defaultEndpoint: "Endpoint Bawaan",
    modelPool: "Daftar Model",
    testPing: "Uji Koneksi",
    testing: "Menguji...",
    configure: "Konfigurasi",
    deleteProvider: "Hapus provider",
    clickToViewPing: "Klik untuk melihat payload ping & detail balasan LLM",
    failed: "Gagal",
    pingInspectionDetails: "Detail Pemeriksaan Ping Langsung",
    promptSent: "Prompt Terkirim:",
    llmReplyReceived: "Balasan LLM Diterima:",
    latency: "Latensi:",
    status: "Status:",
    endpoint: "Endpoint:",

    // Provider Form
    configureProvider: "Konfigurasi Provider",
    addNewProviderConnection: "Tambah Sambungan Provider Baru",
    noEndpointSpecified: "Endpoint belum ditentukan",
    selectActiveModels: "Pilih Model Aktif & Routing",
    endpointCredentials: "Endpoint & Kredensial",
    providerType: "Tipe Provider",
    displayName: "Nama Tampilan",
    baseUrlEndpoint: "Base URL / Endpoint",
    apiKeyToken: "Kunci API / Token",
    apiKeyPlaceholder: "sk-... (Kosongkan jika gateway lokal)",
    activeModelRoutingPriority: "Prioritas Routing Model Aktif",
    selectedCount: "dipilih",
    dragDotsOrArrows: "Tarik titik atau gunakan panah untuk mengatur urutan prioritas",
    primary: "Utama",
    fallback: "Cadangan",
    availableModels: "Model Tersedia",
    filterModels: "Filter Model",
    allModels: "Semua Model",
    freeModelsOnly: "Hanya Model Gratis",
    selectedInPool: "Dipilih di Daftar",
    modelFamilies: "Keluarga Model",
    selectAllFree: "Pilih Semua Gratis",
    searchModels: "Cari model...",
    syncFromApi: "Sinkron dari API",
    syncing: "Menyinkronkan...",
    resetFilters: "Reset Filter",
    clickToSelect: "Klik untuk memilih",
    customModel: "+ Model Kustom",
    add: "Tambah",
    testConnection: "Uji Sambungan",
    testingPing: "Menguji Ping...",
    cancel: "Batal",
    saveProvider: "Simpan Provider",

    // Automation Tab
    desktopAutomationTitle: "Otomasi Desktop & Perilaku OS",
    desktopAutomationSubtitle: "Atur otomasi Office desktop (Word, Excel, PowerPoint), interaksi aplikasi dokumen, dan notifikasi sistem operasi.",
    launchOfficeTitle: "Buka Microsoft Office Saat Mengedit",
    launchOfficeDesc: "Membuka aplikasi desktop Office (Word, Excel, PowerPoint, dll.) secara visual di layar saat menjalankan tugas dokumen. Jika dinonaktifkan, semua modifikasi dokumen dilakukan di latar belakang tanpa membuka jendela.",
    autoBackupTitle: "Cadangan Snapshot Otomatis Sebelum Modifikasi",
    autoBackupDesc: "Membuat cadangan lokal (.bak) di folder .arunaki/backups/ sebelum mengubah berkas demi pemulihan data 100% aman.",
    desktopNotificationsTitle: "Notifikasi Sistem Desktop",
    desktopNotificationsDesc: "Menampilkan notifikasi desktop bawaan saat tugas dokumen dan pembukuan selesai.",
    testDesktopNotification: "Uji Notifikasi Desktop",
    electronShellTitle: "Shell Desktop Native Electron",
    electronShellDesc: "Sistem berkas OS native, overlay jendela, dan jembatan IPC",

    // Account Tab
    userAccountLicenseTitle: "Akun Pengguna & Lisensi",
    userAccountLicenseSubtitle: "Kelola profil workstation, sinkronisasi cloud terenkripsi, dan lisensi workstation multi-perangkat.",
    proLicense: "Lisensi Pro",
    fullNameBusiness: "Nama Lengkap / Identitas Bisnis",
    save: "Simpan",
    signOut: "Keluar Akun",
    licenseDetails: "Rincian Lisensi",
    verificationStatus: "Status Verifikasi",
    activeVerified: "Aktif & Terverifikasi",
    connectedClient: "Klien Terhubung",
    windowsDesktopWorkstation: "Workstation Desktop Windows",
    cloudWorkspaceSync: "Sinkronisasi Cloud Ruang Kerja",
    aesEncryption: "Enkripsi lokal AES-256",
    active: "Aktif",
    createAccount: "Buat Akun Arunaki Baru",
    signInAccount: "Masuk ke Arunaki",
    createAccountDesc: "Daftar untuk mengaktifkan sinkronisasi cloud ruang kerja dan lisensi pro multi-perangkat.",
    signInAccountDesc: "Hubungkan akun Anda untuk menyinkronkan konfigurasi ruang kerja di berbagai perangkat.",
    continueGoogle: "Lanjutkan dengan Google",
    continueGithub: "Lanjutkan dengan GitHub",
    orContinueEmail: "atau lanjutkan dengan email",
    emailAddress: "Alamat Email",
    password: "Kata Sandi",
    registerAndSignIn: "Daftar & Masuk",
    signIn: "Masuk",
    alreadyHaveAccount: "Sudah punya akun? Masuk",
    dontHaveAccount: "Belum punya akun? Daftar",
    privacyGuaranteeTitle: "Jaminan Privasi & Mode Offline:",
    privacyGuaranteeDesc: "Arunaki beroperasi penuh secara lokal offline tanpa memerlukan akun aktif ataupun login internet.",

    // Spreadsheet & Canvas Viewer
    openInExcel: "Buka di Excel",
    openInExcelNative: "Buka di Microsoft Excel",
    openInExcelTooltip: "Buka dokumen ini langsung di aplikasi Microsoft Excel desktop asli",
    copyCsv: "Salin CSV",
    copiedCsv: "Disalin",
    copyCsvTooltip: "Salin isi sheet ini sebagai CSV ke clipboard",
    searchInSheet: "Cari di sheet...",
    rowsLabel: "baris",
    colsLabel: "kolom",
    emptyCell: "Kosong",
    nonDestructiveEmbedTooltip: "Berkas dibuka secara aman di memori (read-only) tanpa mengubah format asli OOXML Excel.",
    spreadsheetBinaryNotice: "Berkas spreadsheet biner telah dimuat. Anda dapat membukanya langsung di Microsoft Excel desktop atau memeriksa integritasnya.",
    sheetsLabel: "Sheets:",
    openInCanvas: "Buka di Canvas",
    openInCanvasTooltip: "Buka tabel ini di Panel Canvas Tengah",
    tableOpenedInCanvas: "Tabel dibuka di panel Canvas",
    dataTableLabel: "Tabel Data",
  },
} as const;

export type TranslationKey = keyof typeof translations.en;

export function getStoredLanguage(): Language {
  if (typeof window === "undefined") return "en";
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY) as Language | null;
  if (stored === "en" || stored === "id") {
    return stored;
  }
  return "en";
}

export function setStoredLanguage(lang: Language): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  window.dispatchEvent(new CustomEvent("arunaki-language-change", { detail: lang }));
}

export function t(key: TranslationKey, fallback?: string): string {
  const currentLang = getStoredLanguage();
  const dict = translations[currentLang] || translations.en;
  return (dict as any)[key] || fallback || (translations.en as any)[key] || key;
}

export function useI18n() {
  const [language, setLanguageState] = useState<Language>(() => getStoredLanguage());

  useEffect(() => {
    const handleLanguageChange = (e: Event) => {
      const customEvent = e as CustomEvent<Language>;
      if (customEvent.detail && customEvent.detail !== language) {
        setLanguageState(customEvent.detail);
      }
    };

    window.addEventListener("arunaki-language-change", handleLanguageChange);
    return () => {
      window.removeEventListener("arunaki-language-change", handleLanguageChange);
    };
  }, [language]);

  const setLanguage = useCallback((lang: Language) => {
    setStoredLanguage(lang);
    setLanguageState(lang);
  }, []);

  const translate = useCallback(
    (key: TranslationKey, fallback?: string) => {
      const dict = translations[language] || translations.en;
      return (dict as any)[key] || fallback || (translations.en as any)[key] || key;
    },
    [language]
  );

  return {
    language,
    setLanguage,
    t: translate,
  };
}
