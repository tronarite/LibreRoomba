// Busca símbolos cuyo nombre contenga alguno de los patrones (arg 0, separados por +), y decompila las funciones que los referencian (arg 1: salida, arg 2: máximo).
// Sirve para leer constantes estáticas (p. ej. los topics de BaseSecureSocketProtocolSerializer) cuyo valor no aparece en `strings`.
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.*;
import ghidra.program.model.listing.*;
import ghidra.program.model.symbol.*;
import java.io.*;
import java.util.*;

public class DumpSymbolRefs extends GhidraScript {
  @Override public void run() throws Exception {
    String[] a = getScriptArgs();
    String[] pats = a[0].split("[+]");
    File out = new File(a[1]);
    int max = a.length > 2 ? Integer.parseInt(a[2]) : 30;
    DecompInterface ifc = new DecompInterface();
    ifc.openProgram(currentProgram);
    Set<Function> funcs = new LinkedHashSet<>();
    try (PrintWriter w = new PrintWriter(new FileWriter(out))) {
      SymbolIterator it = currentProgram.getSymbolTable().getAllSymbols(true);
      while (it.hasNext()) {
        Symbol s = it.next();
        String name = s.getName(true);
        boolean hit = false;
        for (String p : pats) if (name.contains(p)) { hit = true; break; }
        if (!hit) continue;
        w.println("//// simbolo " + name + " @ " + s.getAddress());
        for (Reference r : getReferencesTo(s.getAddress())) {
          Function f = getFunctionContaining(r.getFromAddress());
          w.println("//   ref desde " + r.getFromAddress() + (f == null ? "" : " en " + f.getName(true)));
          if (f != null) funcs.add(f);
        }
      }
      int n = 0;
      for (Function f : funcs) {
        if (n++ >= max) break;
        DecompileResults r = ifc.decompileFunction(f, 90, monitor);
        w.println("//// " + f.getName(true) + " @ " + f.getEntryPoint());
        w.println(r.decompileCompleted() ? r.getDecompiledFunction().getC() : "// no decompilado");
      }
    }
    println("funciones volcadas: " + Math.min(funcs.size(), max));
  }
}
