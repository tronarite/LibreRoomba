# Arnés para cargar libs nativas de la app (arm64, bionic) en WSL2 + qemu-user
Requisitos en WSL Ubuntu-24.04: `qemu-user gcc-aarch64-linux-gnu gdb-multiarch binutils-aarch64-linux-gnu`.
Sysroot Android (ignorado por git): `research/native/android-sysroot/` (linker64, libc/libdl/libm/libc++/liblog/libz sacados del Pixel con `adb pull`; en Git Bash usar `MSYS_NO_PATHCONV=1`). Libs de la app: `research/native/lib-all/lib/arm64-v8a/` (extraídas del split arm64).
- `build.sh` compila `h.c` (con `_start` propio que llama a `__libc_init`, sin eso bionic hace SIGSEGV) a `/tmp/h`.
- `run2.sh` ejecuta `qemu-aarch64 linker64 /tmp/h <lib.so> [símbolos...]` con LD_LIBRARY_PATH al sysroot: hace dlopen y dlsym. Estado 2026-10-28: `libcore_base.so` carga bien.
- Lanzar desde PowerShell: `wsl -d Ubuntu-24.04 -u root -- bash <ruta /mnt/c/...>/run2.sh` (/tmp de WSL se borra entre sesiones; run2 recopia linker64).
