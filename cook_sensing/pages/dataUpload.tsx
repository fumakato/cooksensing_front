import React, { useState, useEffect } from "react";
import axios from "axios";
import { Buffer } from "buffer";
import { useRouter } from "next/router";

const DataUpload: React.FC = () => {
  const router = useRouter();
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string>("");
  const [filename, setFilename] = useState<string>("");
  const [fileurl, setFileurl] = useState<string>("");
  // const [fileList, setFileList] = useState<string[]>([]);
  const [fileList, setFileList] = useState<{ label: string; value: string }[]>(
    []
  );
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [serverMessage, setServerMessage] = useState<string>("");
  const [cooksensing_user_id, setUserId] = useState<number | "">(0);
  const [isLoading, setIsLoading] = useState(false); // ← 追加

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;

  useEffect(() => {
    const storedId = localStorage.getItem("cooksensing_user_id");
    if (storedId) {
      setUserId(Number(storedId));
    } else {
      alert("ユーザーIDが存在しません。ログインしてください。");
      router.push("/signin");
    }

    const now = new Date();
    const hours = now.getHours().toString().padStart(2, "0");
    const minutes = now.getMinutes().toString().padStart(2, "0");
    setTime(`${hours}:${minutes}`);
    setDate(now.toISOString().split("T")[0]);

    const fetchFileList = () => {
      const username = process.env.NEXT_PUBLIC_MINIO_USER;
      const password = process.env.NEXT_PUBLIC_MINIO_PASS;
      const token = Buffer.from(`${username}:${password}`, "utf8").toString(
        "base64"
      );

      interface FileItem {
        label: string;
        value: string;
        sortKey: string;
      }

      axios.post(
        "https://minio-api.kajilab.dev/api/object/list",
        { bucket: "cucumber-slices", prefix: "" },
        {
          headers: {
            Authorization: `Basic ${token}`,
            "Content-Type": "application/json",
          },
        }
      );
      axios
        .post(
          "https://minio-api.kajilab.dev/api/object/list",
          { bucket: "cucumber-slices", prefix: "" },
          {
            headers: {
              Authorization: `Basic ${token}`,
              "Content-Type": "application/json",
            },
          }
        )
        .then((response) => {
          if (Array.isArray(response.data.objects)) {
            const sortedFormatted: FileItem[] = (
              response.data.objects as string[]
            )
              // ① 対象ファイル（_accg.csv）だけをフィルタリング
              .filter((file) => file.endsWith("_accg.csv"))
              // ② ファイル名から名前・日付・時刻を抽出＆整形
              .map((file: string): FileItem => {
                let name = "";
                let dateStr = "";
                let timeStr = "";
                let sortKey = "";

                // ③ まず、コロン区切りのパターンで試す（名前部はオプショナルにする）
                const colonMatch = file.match(
                  /^(.*?)(20\d{2}-\d{2}-\d{2}) (\d{2}:\d{2}):\d{2}_accg\.csv$/
                );
                if (colonMatch) {
                  name = colonMatch[1].trim(); // 名前部分（存在しなければ空文字）
                  dateStr = colonMatch[2]; // 日付部分（例: "2025-04-07"）
                  timeStr = colonMatch[3]; // 時刻部分（例: "17:38"）
                  sortKey = `${dateStr} ${timeStr}`; // ソート用キー
                } else {
                  // ④ 次に、アンダースコア区切りのパターンで試す（名前部はオプショナル）
                  const underscoreMatch = file.match(
                    /^(.*?)(20\d{2}-\d{2}-\d{2}) (\d{2})_(\d{2})_(\d{2})_accg\.csv$/
                  );
                  if (underscoreMatch) {
                    name = underscoreMatch[1].trim();
                    dateStr = underscoreMatch[2];
                    // 時刻は各部分を ":" で結合。秒は表示しない
                    timeStr = `${underscoreMatch[3]}:${underscoreMatch[4]}`;
                    sortKey = `${dateStr} ${timeStr}`;
                  } else {
                    // ⑤ どちらのパターンにもマッチしなければ、sortKey は空文字にして後で除外
                    return { label: file, value: file, sortKey: "" };
                  }
                }

                // ⑥ 表示ラベルを作成：名前があれば "名前 ： MM-DD HH:mm"、なければ "MM-DD HH:mm" とする
                const label =
                  name !== ""
                    ? `${name} ： ${dateStr.slice(5)} ${timeStr}`
                    : `${dateStr.slice(5)} ${timeStr}`;

                return {
                  label,
                  value: file,
                  sortKey,
                };
              })
              // ⑦ sortKey が空（＝パースに失敗したファイル）なものを除外
              .filter((item: FileItem) => item.sortKey !== "")
              // ⑧ 日付＋時刻（sortKey）で降順ソート
              .sort((a: FileItem, b: FileItem) =>
                b.sortKey.localeCompare(a.sortKey)
              );

            setFileList(sortedFormatted);
          } else {
            console.error("ファイルリスト形式エラー:", response.data);
          }
        })
        .catch((error) => {
          console.error("MinIO 接続エラー:", error);
        });
    };

    fetchFileList();
  }, [router, apiBaseUrl]);

  const handleSubmit = async () => {
    setServerMessage("");
    setErrorMessage("");
    setIsLoading(true); // ← ボタン無効化
    if (!date) {
      setErrorMessage("日付を選択してください");
      setIsLoading(false); // ← エラー時に戻す
    } else if (filename === "") {
      setErrorMessage("ファイルを選択してください");
      setIsLoading(false); // ← エラー時に戻す
    } else {
      const username = process.env.NEXT_PUBLIC_MINIO_USER;
      const password = process.env.NEXT_PUBLIC_MINIO_PASS;
      const token = Buffer.from(`${username}:${password}`, "utf8").toString(
        "base64"
      );

      try {
        const response = await axios.post(
          "https://minio-api.kajilab.dev/api/object/get",
          {
            bucket: "cucumber-slices",
            key: filename,
          },
          {
            headers: {
              Authorization: `Basic ${token}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (response.data && typeof response.data.url === "string") {
          setFileurl(response.data.url);
        } else {
          setErrorMessage("ファイルのURLが取得できませんでした");
          setIsLoading(false); // ← 念のため
        }
      } catch (error) {
        console.error("ファイル取得エラー:", error);
        setErrorMessage("ファイル取得中にエラーが発生しました");
        setIsLoading(false); // ← 念のため
      }
    }
  };

  useEffect(() => {
    if (fileurl !== "") {
      const submitData = async () => {
        const data = {
          fileurl,
          uid: String(cooksensing_user_id),
          date: `${date}T${time}`,
        };

        try {
          const response = await axios.post(
            // "http://localhost:8080/feature_data",
            `${apiBaseUrl}/feature_data`,
            data,
            {
              headers: {
                "Content-Type": "application/json",
              },
            }
          );

          if (response.status === 200) {
            alert("データ登録に成功しました");
            router.push("/featureGraph");
          }
        } catch (error: any) {
          if (error.response) {
            const { code, error: message } = error.response.data;
            setServerMessage(`エラー: ${message} (コード: ${code})`);
            setIsLoading(false); // ← 念のため
          } else {
            setServerMessage("不明なエラーが発生しました");
            setIsLoading(false); // ← 念のため
          }
          console.error("送信中にエラーが発生しました", error);
          setIsLoading(false); // ← 念のため
        }
      };

      submitData();
    }
  }, [fileurl, cooksensing_user_id, date, time, router]);

  return (
    <div style={{ padding: "20px", maxWidth: "400px", margin: "auto" }}>
      <h2>データ登録</h2>
      <p style={{ color: "red" }}>{errorMessage}</p>
      <p style={{ color: "red" }}>{serverMessage}</p>

      <div style={{ marginBottom: "1rem" }}>
        <label>
          行動データ：
          {/* <select
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            style={{ marginLeft: "10px" }}
          >
            <option value="">Select a file</option>
            {fileList.map((file) => (
              <option key={file} value={file}>
                {file}
              </option>
            ))}
          </select> */}
          <select
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
          >
            <option value="">Select a file</option>
            {fileList.map((file) => (
              <option key={file.value} value={file.value}>
                {file.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <label>
          日付:
          <input
            type="date"
            value={date ? date : ""}
            onChange={(e) => setDate(e.target.value)}
            style={{ marginLeft: "10px", marginRight: "20px" }}
          />
        </label>
        <label>
          時間:
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            style={{ marginLeft: "10px" }}
          />
        </label>
      </div>

      <button
        onClick={handleSubmit}
        style={{ padding: "10px 20px" }}
        disabled={isLoading}
      >
        {isLoading ? "登録中..." : "データ登録"}
      </button>
    </div>
  );
};

export default DataUpload;
