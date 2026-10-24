// Decompila las funciones cuyo nombre contiene alguno de los patrones (args separados por coma) y las escribe en un archivo.
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.*;
import ghidra.program.model.listing.*;
import java.io.*;

public class DumpDecomp extends GhidraScript {
  @Override public void run() throws Exception {
    String[] a = getScriptArgs();
    String[] pats = a[0].split(",");
    File out = new File(a[1]);
    int max = a.length > 2 ? Integer.parseInt(a[2]) : 60;
    DecompInterface ifc = new DecompInterface();
    ifc.openProgram(currentProgram);
    int n = 0;
    try (PrintWriter w = new PrintWriter(new FileWriter(out))) {
      for (Function f : currentProgram.getFunctionManager().getFunctions(true)) {
        String name = f.getName(true);
        boolean hit = false;
        for (String p : pats) if (name.contains(p)) { hit = true; break; }
        if (!hit || n >= max) continue;
        DecompileResults r = ifc.decompileFunction(f, 60, monitor);
        w.println("//// " + name + " @ " + f.getEntryPoint());
        w.println(r.decompileCompleted() ? r.getDecompiledFunction().getC() : "// no decompilado");
        n++;
      }
    }
    println("funciones volcadas: " + n);
  }
}
