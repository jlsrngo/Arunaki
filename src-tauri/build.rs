fn main() {
  println!("cargo:rerun-if-changed=../apps/dist");
  println!("cargo:rerun-if-changed=../apps/dist/index.html");
  println!("cargo:rerun-if-changed=../apps/dist/assets");
  tauri_build::build()
}
