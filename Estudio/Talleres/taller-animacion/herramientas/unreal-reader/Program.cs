using System.IO.Compression;
using Newtonsoft.Json.Linq;
using UAssetAPI;
using UAssetAPI.UnrealTypes;
if (!args[0].EndsWith(".zip", StringComparison.OrdinalIgnoreCase)) {
    var a = new UAsset(args[0], EngineVersion.VER_UE5_8);
    File.WriteAllText(args[1], a.SerializeJson());
    return;
}
Directory.CreateDirectory(args[1]);
using var zip = ZipFile.OpenRead(args[0]);
if (args.Length > 2 && args[2] == "--skeleton") {
    var skelName = args.Length > 3 ? args[3] : "/SK_Mannequin.uasset";
    var entry = zip.Entries.Single(e => e.FullName.EndsWith(skelName));
    using var stream = entry.Open();
    using var mem = new MemoryStream(); stream.CopyTo(mem); mem.Position = 0;
    var asset = new UAsset(new AssetBinaryReader(mem), EngineVersion.VER_UE5_8);
    var json = JObject.Parse(asset.SerializeJson());
    var export = json["Exports"]!.Single(e => (string?)e["ObjectName"] == Path.GetFileNameWithoutExtension(entry.FullName));
    using var reader = new BinaryReader(new MemoryStream(Convert.FromBase64String((string)export["Extras"]!)));
    var count = reader.ReadInt32();
    if (count < 20 || count > 2000) throw new Exception("Invalid reference skeleton");
    var bones = new List<Dictionary<string, object>>();
    for (int i = 0; i < count; i++) {
        int nameIndex = reader.ReadInt32(), number = reader.ReadInt32(), parent = reader.ReadInt32();
        int length = reader.ReadInt32();
        if (length < 1 || length > 1024) throw new Exception("Unsupported bone FString");
        var name = System.Text.Encoding.UTF8.GetString(reader.ReadBytes(length - 1)); reader.ReadByte();
        if (parent >= i || parent < -1) throw new Exception("Invalid parent");
        bones.Add(new() { ["name"] = name, ["parent"] = parent });
    }
    if (reader.ReadInt32() != count) throw new Exception("Reference pose count mismatch");
    foreach (var b in bones) {
        b["rotation"] = Enumerable.Range(0, 4).Select(_ => reader.ReadDouble()).ToArray();
        b["translation"] = Enumerable.Range(0, 3).Select(_ => reader.ReadDouble()).ToArray();
        b["scale"] = Enumerable.Range(0, 3).Select(_ => reader.ReadDouble()).ToArray();
    }
    File.WriteAllText(Path.Combine(args[1], "_skeleton.json"), Newtonsoft.Json.JsonConvert.SerializeObject(bones));
    Console.WriteLine($"Reference skeleton: {bones.Count} bones");
    return;
}
var report = new List<object>();
int failures = 0;
foreach (var entry in zip.Entries.Where(e => e.FullName.Contains("/Anims/") && e.FullName.EndsWith(".uasset"))) {
    try {
        using var stream = entry.Open();
        using var mem = new MemoryStream(); stream.CopyTo(mem); mem.Position = 0;
        var asset = new UAsset(new AssetBinaryReader(mem), EngineVersion.VER_UE5_8);
        var json = JObject.Parse(asset.SerializeJson());
        var section = json["Exports"]!.FirstOrDefault(e => e["Data"]?.Any(p => (string?)p["Name"] == "TransformParameterNamesAndCurves") == true);
        if (section == null) { report.Add(new { source = entry.FullName, status = "not-sequence" }); continue; }
        var transforms = section["Data"]!.First(p => (string?)p["Name"] == "TransformParameterNamesAndCurves")["Value"]!;
        var bones = new List<object>();
        foreach (var transform in transforms) {
            var properties = transform["Value"]!;
            var name = (string?)properties.First(p => (string?)p["Name"] == "ParameterName")["Value"];
            var channels = new List<object>();
            foreach (var prop in properties.Where(p => (string?)p["Name"] != "ParameterName")) {
                var ch = prop["Value"]![0]!["Value"]!;
                channels.Add(new { type = (string?)prop["Name"], axis = (int)prop["ArrayIndex"]!, times = ch["Times"]!.Select(t => (int)t["Value"]!).ToArray(), values = ch["Values"]!.Select(v => (double)v["Value"]!).ToArray(), modes = ch["Values"]!.Select(v => (string?)v["InterpMode"]).Distinct().ToArray(), defaultValue = (double)ch["DefaultValue"]!, hasDefault = (bool)ch["bHasDefaultValue"]!, rate = ch["TickResolution"] });
            }
            bones.Add(new { name, channels });
        }
        var nameBase = Path.GetFileNameWithoutExtension(entry.FullName);
        var output = Path.Combine(args[1], nameBase + ".json");
        if (File.Exists(output)) throw new Exception("Output exists: " + output);
        File.WriteAllText(output, Newtonsoft.Json.JsonConvert.SerializeObject(new { name = nameBase, source = entry.FullName, bones }));
        report.Add(new { source = entry.FullName, status = "extracted", bones = bones.Count });
    } catch(Exception ex) { failures++; report.Add(new { source = entry.FullName, status = "error", error = ex.Message }); }
}
File.WriteAllText(Path.Combine(args[1], "_extraction.json"), Newtonsoft.Json.JsonConvert.SerializeObject(report, Newtonsoft.Json.Formatting.Indented));
Console.WriteLine($"Inspected {report.Count} assets. Report: {args[1]}/_extraction.json");
Environment.ExitCode = failures == 0 ? 0 : 1;
