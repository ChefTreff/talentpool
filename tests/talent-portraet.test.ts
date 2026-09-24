import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { MAX_PORTRAIT_BYTES, PORTRAIT_BUCKET, PORTRAIT_MIME, portraitPath } from "@/app/(talent)/profil/portraet";

describe("Porträt im Teilnehmer-Profil (TAL-012)", () => {
  const pid = "11111111-2222-3333-4444-555555555555";
  const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

  it("baut genau zwei Segmente, wie person_photo_path_allowed sie verlangt", () => {
    const path = portraitPath(pid, "Mein Foto (1).JPG", id);
    assert.equal(path.split("/").length, 2);
    assert.ok(path.startsWith(`${pid}/${id}-`));
  });

  it("lässt keinen Pfadtrenner aus dem Dateinamen durch", () => {
    const path = portraitPath(pid, "../../fremd/x.png", id);
    assert.equal(path.split("/").length, 2);
    assert.doesNotMatch(path, /\.\./);
  });

  it("hält die Grenzen des Buckets ein", () => {
    assert.equal(PORTRAIT_BUCKET, "person-photos");
    assert.equal(MAX_PORTRAIT_BYTES, 5242880);
    assert.deepEqual([...PORTRAIT_MIME].sort(), ["image/jpeg", "image/png", "image/webp"]);
  });
});
