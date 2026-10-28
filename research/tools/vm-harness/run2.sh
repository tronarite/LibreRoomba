R=/mnt/c/Users/MARCELO/Documents/Proyectos/LibreRoomba/research/native
S=$R/android-sysroot
cp -f $S/apex/com.android.runtime/bin/linker64 /tmp/linker64; chmod +x /tmp/linker64
export LD_LIBRARY_PATH=$R/lib-all/lib/arm64-v8a:$S/apex/com.android.runtime/lib64/bionic:$S/apex/com.android.runtime/lib64:$S/system/lib64
ls -l /tmp/h /tmp/linker64
qemu-aarch64 /tmp/linker64 /tmp/h $R/lib-all/lib/arm64-v8a/libcore_base.so > /tmp/out.txt 2> /tmp/err.txt
echo exit=$?; head -c 1500 /tmp/out.txt; echo ---; head -c 1500 /tmp/err.txt
