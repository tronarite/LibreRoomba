R=/mnt/c/Users/MARCELO/Documents/Proyectos/LibreRoomba/research/native
S=$R/android-sysroot/apex/com.android.runtime/lib64/bionic
D=/mnt/c/Users/MARCELO/Documents/Proyectos/LibreRoomba/research/tools/vm-harness
cd /tmp
aarch64-linux-gnu-gcc -O0 -U_FORTIFY_SOURCE -D_FORTIFY_SOURCE=0 -nostdlib -nostartfiles -fno-stack-protector -o h $D/h.c -Wl,-dynamic-linker,/apex/com.android.runtime/bin/linker64 -Wl,-e,_start -Wl,--allow-shlib-undefined $S/libdl.so $S/libc.so 2>&1 | head
file h 2>/dev/null | head -2
