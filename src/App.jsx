import React, { useState, useRef } from 'react';
import { DiffEditor } from '@monaco-editor/react';

export default function App() {
  const diffEditorRef = useRef(null);

  // 状態管理
  const [fileList, setFileList] = useState([]);
  const [selectedPath, setSelectedPath] = useState(null);
  const [leftCode, setLeftCode] = useState('// フォルダまたはファイルを選択してください');
  const [rightCode, setRightCode] = useState('// フォルダまたはファイルを選択してください');
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Monaco Theme 設定
  const handleEditorMount = (editor, monaco) => {
    diffEditorRef.current = editor;
    monaco.editor.defineTheme('winmergeTheme', {
      base: 'vs',
      inherit: true,
      rules: [],
      colors: {
        'diffEditor.insertedTextBackground': '#ffff9944',
        'diffEditor.removedTextBackground': '#ffff9944',
        'diffEditor.insertedLineBackground': '#ffffcc33',
        'diffEditor.removedLineBackground': '#ffffcc33',
      }
    });
    monaco.editor.setTheme('winmergeTheme');
  };

  // フォルダ内の全ファイルを再帰的に取得する関数
  const scanDirectory = async (dirHandle, currentPath = '') => {
    let files = {};
    for await (const entry of dirHandle.values()) {
      const relPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
      if (entry.kind === 'file') {
        files[relPath] = entry;
      } else if (entry.kind === 'directory') {
        const subFiles = await scanDirectory(entry, relPath);
        Object.assign(files, subFiles);
      }
    }
    return files;
  };

  // 左右のフォルダを選択して比較実行
  const handleCompareFolders = async () => {
    try {
      alert('最初に「左側（比較元）」のフォルダを選択してください。');
      const leftDir = await window.showDirectoryPicker();
      
      alert('次に「右側（比較先）」のフォルダを選択してください。');
      const rightDir = await window.showDirectoryPicker();

      const leftFiles = await scanDirectory(leftDir);
      const rightFiles = await scanDirectory(rightDir);

      const allPaths = Array.from(new Set([...Object.keys(leftFiles), ...Object.keys(rightFiles)])).sort();

      const comparisons = await Promise.all(allPaths.map(async (path) => {
        const leftHandle = leftFiles[path];
        const rightHandle = rightFiles[path];

        let status = 'same'; // 'same' | 'different' | 'left-only' | 'right-only'

        if (leftHandle && !rightHandle) {
          status = 'left-only';
        } else if (!leftHandle && rightHandle) {
          status = 'right-only';
        } else {
          // 両方に存在する場合、テキスト比較
          const leftText = await (await leftHandle.getFile()).text();
          const rightText = await (await rightHandle.getFile()).text();
          if (leftText !== rightText) {
            status = 'different';
          }
        }

        return { path, status, leftHandle, rightHandle };
      }));

      setFileList(comparisons);
      setIsSidebarOpen(true);
    } catch (err) {
      if (err.name !== 'AbortError') console.error('フォルダ比較エラー:', err);
    }
  };

  // サイドバーでファイルが選択された時の処理
  const handleSelectFilePair = async (item) => {
    setSelectedPath(item.path);

    let leftText = '';
    let rightText = '';

    if (item.leftHandle) {
      const file = await item.leftHandle.getFile();
      leftText = await file.text();
    }
    if (item.rightHandle) {
      const file = await item.rightHandle.getFile();
      rightText = await file.text();
    }

    setLeftCode(leftText);
    setRightCode(rightText);
  };

  // 右側ファイルの保存
  const handleSaveFile = async () => {
    if (!diffEditorRef.current) return;
    const currentMergedText = diffEditorRef.current.getModifiedEditor().getValue();

    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: selectedPath ? selectedPath.split('/').pop() : 'merged.txt',
      });
      const writable = await handle.createWritable();
      await writable.write(currentMergedText);
      await writable.close();
      alert('ファイルの保存が完了しました！');
    } catch (err) {
      if (err.name !== 'AbortError') console.error('保存エラー:', err);
    }
  };

  // ステータスに応じたバッジ表示
  const renderStatusBadge = (status) => {
    switch (status) {
      case 'different': return <span style={{ color: '#d97706', fontWeight: 'bold' }}>⚠️ 差分あり</span>;
      case 'left-only': return <span style={{ color: '#2563eb' }}>➕ 左のみ</span>;
      case 'right-only': return <span style={{ color: '#16a34a' }}>➕ 右のみ</span>;
      default: return <span style={{ color: '#9ca3af' }}>✅ 一致</span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', margin: 0, padding: 0, fontFamily: 'sans-serif' }}>
      {/* 上部ツールバー */}
      <div style={{ padding: '8px 16px', backgroundColor: '#eef1f5', borderBottom: '1px solid #ccc', display: 'flex', gap: '12px', alignItems: 'center' }}>
        <button onClick={handleCompareFolders} style={{ padding: '6px 12px', fontWeight: 'bold', cursor: 'pointer' }}>
          📁 フォルダ比較を開始
        </button>

        <span style={{ margin: '0 8px', color: '#888' }}>|</span>

        <button onClick={handleSaveFile} style={{ backgroundColor: '#007acc', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>
          💾 右側を保存
        </button>

        <label style={{ marginLeft: 'auto', fontSize: '13px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={ignoreWhitespace}
            onChange={(e) => setIgnoreWhitespace(e.target.checked)}
          />
          空白・空行の無視
        </label>
      </div>

      {/* メイン表示領域（サイドバー + Monaco Diff） */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        
        {/* 左側：フォルダ比較結果一覧サイドバー */}
        {isSidebarOpen && (
          <div style={{ width: '320px', borderRight: '1px solid #ccc', backgroundColor: '#fafafa', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '8px 12px', backgroundColor: '#e5e7eb', fontSize: '13px', fontWeight: 'bold', borderBottom: '1px solid #ccc' }}>
              比較対象ファイル一覧 ({fileList.length} 件)
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {fileList.length === 0 ? (
                <div style={{ padding: '16px', fontSize: '13px', color: '#6b7280' }}>
                  「📁 フォルダ比較を開始」を押して、比較したい2つのフォルダを選択してください。
                </div>
              ) : (
                fileList.map((item) => (
                  <div
                    key={item.path}
                    onClick={() => handleSelectFilePair(item)}
                    style={{
                      padding: '8px 12px',
                      borderBottom: '1px solid #eee',
                      cursor: 'pointer',
                      fontSize: '12px',
                      backgroundColor: selectedPath === item.path ? '#e0f2fe' : 'transparent',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <span style={{ wordBreak: 'break-all', paddingRight: '8px' }}>{item.path}</span>
                    {renderStatusBadge(item.status)}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 右側：Monaco Diff エディタ */}
        <div style={{ flex: 1 }}>
          <DiffEditor
            height="100%"
            language="plaintext"
            original={leftCode}
            modified={rightCode}
            onMount={handleEditorMount}
            options={{
              ignoreTrimWhitespace: ignoreWhitespace,
              renderSideBySide: true,
              originalEditable: true,
              readOnly: false,
              minimap: { enabled: true }
            }}
          />
        </div>
      </div>
    </div>
  );
}