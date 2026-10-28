#include <stdio.h>
#include <stdlib.h>
#include <dlfcn.h>
int main(int argc,char**argv,char**envp){
  void*h=dlopen(argv[1],2);
  if(!h){printf("dlopen fail: %s\n",dlerror());fflush(stdout);exit(1);}
  printf("loaded %s at %p\n",argv[1],h);
  for(int i=2;i<argc;i++){void*p=dlsym(h,argv[i]);printf("%s=%p\n",argv[i],p);}
  fflush(stdout);exit(0);}
extern void __libc_init(void*,void(*)(void),int(*)(int,char**,char**),void*);
static long structors[6];
__attribute__((naked,noreturn)) void _start(void){
  __asm__ volatile(
   "mov x0, sp\n mov x1, xzr\n adrp x2, main\n add x2, x2, :lo12:main\n"
   "adrp x3, structors\n add x3, x3, :lo12:structors\n bl __libc_init\n");
}
