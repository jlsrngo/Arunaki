fn main() {
    println!("cargo:rerun-if-changed=arunaki.ico");
    println!("cargo:rerun-if-changed=arunaki.rc");

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;

        let out_dir = std::env::var("OUT_DIR").unwrap();
        let res_path = format!("{}/arunaki.res", out_dir);

        let rc_candidates = [
            "rc.exe",
            "C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.26100.0\\x64\\rc.exe",
            "C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.22621.0\\x64\\rc.exe",
            "C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.22000.0\\x64\\rc.exe",
            "C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.19041.0\\x64\\rc.exe",
        ];

        let mut compiled = false;
        for rc in &rc_candidates {
            if Command::new(rc)
                .args(["/fo", &res_path, "arunaki.rc"])
                .status()
                .map(|s| s.success())
                .unwrap_or(false)
            {
                compiled = true;
                break;
            }
        }

        if compiled {
            println!("cargo:rustc-link-arg={}", res_path);
        }
    }
}
