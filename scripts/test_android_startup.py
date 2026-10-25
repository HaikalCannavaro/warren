import importlib.util
from pathlib import Path
import struct
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("startup", Path(__file__).with_name("verify-android-startup.py"))
startup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(startup)


def uleb(value):
    result = bytearray()
    while value >= 128:
        result.append((value & 127) | 128)
        value >>= 7
    result.append(value)
    return result


def fixture(*, defined=True, public=True, parameters=False, code=True, constructor=True):
    # Minimal DEX metadata. Method references exist even when no method is defined,
    # reproducing the distinction that matters in the released 0.6.0 APK.
    data = bytearray(112)
    data[:8] = b"dex\n039\0"
    struct.pack_into("<I", data, 40, 0x12345678)
    strings = [startup.DATABASE, "V", "<init>" if constructor else "other", "I"]
    string_ids = len(data)
    data.extend(bytes(4 * len(strings)))
    for index, text in enumerate(strings):
        struct.pack_into("<I", data, string_ids + index * 4, len(data))
        data.extend(uleb(len(text)) + text.encode() + b"\0")
    types = len(data)
    data.extend(struct.pack("<III", 0, 1, 3))
    protos = len(data)
    data.extend(struct.pack("<III", 1, 1, 0))
    if parameters:
        struct.pack_into("<I", data, protos + 8, len(data))
        data.extend(struct.pack("<IH", 1, 2))
    methods = len(data)
    data.extend(struct.pack("<HHI", 0, 0, 2))
    classes = len(data)
    data.extend(bytes(32))
    struct.pack_into("<I", data, classes + 24, len(data))
    data.extend(uleb(0) + uleb(0) + uleb(int(defined)) + uleb(0))
    if defined:
        data.extend(uleb(0) + uleb(0x10000 | (1 if public else 2)) + uleb(112 if code else 0))
    for header, count, offset in [(56, 4, string_ids), (64, 3, types), (72, 1, protos), (88, 1, methods), (96, 1, classes)]:
        struct.pack_into("<II", data, header, count, offset)
    return data


class StartupTests(unittest.TestCase):
    def test_public_no_arg_constructor_definition_passes(self):
        self.assertTrue(startup.Dex(fixture()).public_constructor())

    def test_reference_without_definition_fails(self):
        self.assertFalse(startup.Dex(fixture(defined=False)).public_constructor())

    def test_non_public_constructor_fails(self):
        self.assertFalse(startup.Dex(fixture(public=False)).public_constructor())

    def test_parameterized_constructor_fails(self):
        self.assertFalse(startup.Dex(fixture(parameters=True)).public_constructor())

    def test_missing_code_fails(self):
        self.assertFalse(startup.Dex(fixture(code=False)).public_constructor())

    def test_unrelated_public_method_fails(self):
        self.assertFalse(startup.Dex(fixture(constructor=False)).public_constructor())

    def test_truncated_dex_fails(self):
        with self.assertRaises(ValueError):
            startup.Dex(fixture()[:-5]).public_constructor()

    def test_multidex_apk_passes(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "test.apk"
            with zipfile.ZipFile(path, "w") as apk:
                apk.writestr("classes.dex", fixture(defined=False))
                apk.writestr("classes2.dex", fixture())
            self.assertEqual(startup.verify_apk(path), "classes2.dex")

    def test_broken_apk_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "test.apk"
            with zipfile.ZipFile(path, "w") as apk:
                apk.writestr("classes.dex", fixture(defined=False))
            with self.assertRaisesRegex(ValueError, "no public no-argument constructor"):
                startup.verify_apk(path)

    def test_apk_without_dex_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "test.apk"
            with zipfile.ZipFile(path, "w"):
                pass
            with self.assertRaisesRegex(ValueError, "no DEX"):
                startup.verify_apk(path)


if __name__ == "__main__":
    unittest.main()
