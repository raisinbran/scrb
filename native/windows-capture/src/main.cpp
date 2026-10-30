// scrb-capture: Windows capture helper.  Reads one flat JSON command per line
// on stdin and writes one JSON ack or event per line on stdout.  See README.md.
// When stdin closes the recording is stopped and finalized, so a dead parent
// never leaves chunks open.
#define _CRT_SECURE_NO_WARNINGS
#include <fcntl.h>
#include <io.h>

#include <iostream>

#include "Session.h"

using namespace scrb;

namespace {

// Flat objects: string values are unescaped, other values, arrays included, kept as written.
Command ParseCommand(const std::string& s) {
    Command out;
    size_t i = 0;
    auto skip = [&] { while (i < s.size() && (isspace(static_cast<unsigned char>(s[i])) || s[i] == ',')) ++i; };
    auto parseString = [&] {
        std::string r;
        for (++i; i < s.size() && s[i] != '"'; ++i) {
            if (s[i] == '\\' && i + 1 < s.size()) {
                ++i;
                r += s[i] == 'n' ? '\n' : s[i] == 't' ? '\t' : s[i];
            } else {
                r += s[i];
            }
        }
        ++i;
        return r;
    };
    skip();
    if (i < s.size() && s[i] == '{') ++i;
    for (;;) {
        skip();
        if (i >= s.size() || s[i] != '"') break;
        std::string key = parseString();
        skip();
        if (i < s.size() && s[i] == ':') ++i;
        skip();
        if (i < s.size() && s[i] == '"') {
            out[key] = parseString();
        } else {
            size_t start = i;
            if (i < s.size() && s[i] == '[') {
                while (i < s.size() && s[i] != ']') ++i;
                ++i;
            } else {
                while (i < s.size() && s[i] != ',' && s[i] != '}') ++i;
            }
            out[key] = s.substr(start, i - start);
        }
    }
    return out;
}

}  // namespace

int wmain(int argc, wchar_t** argv) {
    // Tells recovery whether a worker still holds that lock.
    if (argc == 3 && std::wstring(argv[1]) == L"check-lock") {
        HANDLE lock = CreateFileW(argv[2], GENERIC_READ, 0, nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
        if (lock != INVALID_HANDLE_VALUE) CloseHandle(lock);
        else if (GetLastError() == ERROR_SHARING_VIOLATION) return 3;
        return 0;
    }
    SessionOptions options;
    for (int i = 1; i < argc; ++i) {
        std::wstring a = argv[i];
        if (a == L"--test-hooks") options.testHooks = true;
        else if (a == L"--death-limit-ms" && i + 1 < argc) options.deathLimitNs = _wtoi64(argv[++i]) * kNsPerMs;
        else if (a == L"--debounce-ms" && i + 1 < argc) options.debounceNs = _wtoi64(argv[++i]) * kNsPerMs;
    }
    _setmode(_fileno(stdin), _O_BINARY);
    _setmode(_fileno(stdout), _O_BINARY);
    CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    {
        Session session(options);
        std::thread reader([&session] {
            std::string line;
            while (std::getline(std::cin, line)) {
                if (line.find_first_not_of(" \r\n\t") == std::string::npos) continue;
                Command cmd = ParseCommand(line);
                session.Post([&session, cmd] { session.Handle(cmd); });
            }
            session.Post([&session] {
                Command quit{{"name", "quit"}};
                session.Handle(quit);
            });
        });
        reader.detach();
        session.Run();
        FlushEmitter();
    }
    CoUninitialize();
    ExitProcess(0);  // the detached stdin reader may still be blocked in a read
}
