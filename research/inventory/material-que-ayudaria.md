# Material que el usuario puede aportar (lista de 2026-10-28)

Ordenado por rendimiento esperado. Nada de esto requiere tocar el robot salvo donde se indica.

## Firmware y binarios (lo más valioso)
1. **Paquete de firmware de la i1+ / i3** (`daredevil+2.6.0` o cualquiera de la familia `daredevil`/`lewis`): .bin, .tar, .swu o .zip descargado de una web de firmware, foros (r/roomba, Home Assistant, dorita980 issues) o de una copia de seguridad. Con él se puede leer la tabla de topics MQTT locales, los comandos reales (`quick`, `spot`, RRTP) y el formato de `regions` sin Ghidra sobre la app.
2. **APK de otras versiones de iRobot Home** (p. ej. 7.x anteriores y 6.x) para comparar con la 7.18.0: qué comandos y capacidades aparecen o desaparecen. Útil también el APK de la app antigua «iRobot HOME» (la que aún usaba conexión local sin AWS).
3. **Imagen ISO / VM** solo si es de herramientas de análisis (p. ej. una VM Linux con Ghidra, Frida, binwalk o QEMU user-mode arm64) para ejecutar `libcore_base.so` y leer constantes en tiempo de ejecución. En Windows no se pueden cargar esas libs; una VM Linux (WSL2 sirve) lo permitiría.

## Capturas de tráfico
4. **Captura de la app oficial con la Roomba haciendo una misión** (pcap desde el router o `adb` en el Pixel 10a con `tcpdump`/PCAPdroid). El tráfico local es TLS, pero se ven el descubrimiento UDP, los hostnames de la nube y los tamaños/tiempos; con PCAPdroid (descifra TLS de la propia app con certificado instalado) se verían los endpoints de nube reales durante la misión. Ayuda con las pistas de `mission/timeline` y `rrtp`.
5. **Logcat de la app durante una limpieza** (`adb logcat -d > log.txt` justo después): el núcleo C++ registra topics y comandos.

## Cuenta y datos
6. **Sesión de nube vigente** (`node research\cloud\login.js` en tu terminal) cuando quieras que lea datos nuevos (historial, UMF de misiones recientes). Caduca.
7. **Capturas de pantalla de la app oficial** (Pixel 10a) de: Ajustes de la Roomba, Mantenimiento, programación, historial y mapa de una misión. Sirven para clonar la interfaz con fidelidad y detectar funciones que aún no replicamos.
8. **Exportación de datos de tu cuenta de iRobot** (GDPR, desde ajustes de la cuenta o petición por correo): incluye todo lo que la nube guarda del robot.

## Con acceso a la Roomba (cuando lo digas)
9. Suscripción a `#` durante una misión (topics RRTP/otros) y la lista de `pending-robot-tests.md`.
10. Probar `spot` fuera de la base y `train` completo.

## Qué NO hace falta
- Contraseñas por el chat (siguen sin pasar por aquí).
- Nada para el trabajo de la web app: sigue adelante contra `--mock`.
