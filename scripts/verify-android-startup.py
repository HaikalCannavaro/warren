"""Fail a release if R8 removes the Room constructor used by WorkManager.

Uses only Python's standard library. Check encoded method *definitions*, not
strings or references: the broken 0.6.0 APK still contained the database class.
"""
import argparse
from pathlib import Path
import re
import struct
import sys
import zipfile

DATABASE = "Landroidx/work/impl/WorkDatabase_Impl;"


class Dex:
    def __init__(self, data):
        self.data = data
        if len(data) < 112 or not re.fullmatch(rb"dex\n0(?:3[5-9]|40)\x00", data[:8]):
            raise ValueError("Unsupported or invalid DEX header")
        if self.u32(40) != 0x12345678:
            raise ValueError("Unsupported DEX byte order")

    def read(self, offset, size):
        if offset < 0 or offset + size > len(self.data):
            raise ValueError("DEX offset is outside the file")
        return self.data[offset:offset + size]

    def u32(self, offset):
        return struct.unpack("<I", self.read(offset, 4))[0]

    def uleb(self, offset):
        value = 0
        for shift in range(0, 35, 7):
            byte = self.read(offset, 1)[0]
            offset += 1
            value |= (byte & 127) << shift
            if not byte & 128:
                return value, offset
        raise ValueError("Invalid DEX ULEB128")

    def table_entry(self, header, index, width):
        count, offset = self.u32(header), self.u32(header + 4)
        if not 0 <= index < count:
            raise ValueError("Invalid DEX table index")
        position = offset + index * width
        self.read(position, width)
        return position

    def string(self, index):
        offset = self.u32(self.table_entry(56, index, 4))
        _, start = self.uleb(offset)
        end = self.data.find(b"\0", start)
        if end < 0:
            raise ValueError("Unterminated DEX string")
        # Only ASCII class/method names are compared; other MUTF-8 is irrelevant.
        return self.data[start:end].decode("utf-8", errors="replace")

    def type_name(self, index):
        return self.string(self.u32(self.table_entry(64, index, 4)))

    def public_constructor(self):
        for index in range(self.u32(96)):
            entry = self.table_entry(96, index, 32)
            if self.type_name(self.u32(entry)) != DATABASE:
                continue
            offset = self.u32(entry + 24)
            if not offset:
                return False
            counts = []
            for _ in range(4):
                count, offset = self.uleb(offset)
                counts.append(count)
            for _ in range(counts[0] + counts[1]):
                _, offset = self.uleb(offset)  # field index difference
                _, offset = self.uleb(offset)  # access flags
            method_index = 0
            for _ in range(counts[2]):  # constructors are direct methods
                difference, offset = self.uleb(offset)
                flags, offset = self.uleb(offset)
                code, offset = self.uleb(offset)
                method_index += difference
                method = self.table_entry(88, method_index, 8)
                owner, proto, name = struct.unpack("<HHI", self.read(method, 8))
                if self.type_name(owner) != DATABASE or self.string(name) != "<init>":
                    continue
                signature = self.table_entry(72, proto, 12)
                parameters = self.u32(signature + 8)
                if (flags & 1 and code and self.type_name(self.u32(signature + 4)) == "V"
                        and (not parameters or self.u32(parameters) == 0)):
                    return True
            return False
        return False


def verify_apk(path):
    with zipfile.ZipFile(path) as apk:
        dex_names = sorted(name for name in apk.namelist() if re.fullmatch(r"classes(?:[2-9]|[1-9]\d+)?\.dex", name))
        if not dex_names:
            raise ValueError("APK contains no DEX files")
        for name in dex_names:
            if Dex(apk.read(name)).public_constructor():
                return name
    raise ValueError("WorkDatabase_Impl has no public no-argument constructor definition. "
                     "Room/WorkManager will crash at startup; check consumer-rules.pro and rebuild.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("apk", type=Path)
    args = parser.parse_args()
    try:
        name = verify_apk(args.apk)
    except (OSError, ValueError, zipfile.BadZipFile, struct.error) as error:
        print(f"Android startup verification FAILED: {error}", file=sys.stderr)
        return 1
    print(f"Android startup verification passed: public WorkDatabase_Impl() in {name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
