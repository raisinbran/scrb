#include <Windows.h>

#include <cstdlib>

int wmain(int argc, wchar_t** argv)
{
    const DWORD delaySeconds = argc > 1 ? wcstoul(argv[1], nullptr, 10) : 3;
    SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX);
    Sleep(delaySeconds * 1000);
    TerminateProcess(GetCurrentProcess(), 0xDEAD);
    return 0;
}
