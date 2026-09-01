using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace novel_reading_demo;

public class MainForm : Form
{
    private readonly WebView2 _webView = new();
    private readonly string _logPath = Path.Combine(Path.GetTempPath(), "novel-reading-demo.log");

    public MainForm()
    {
        Text = "novel-reading-demo";
        Width = 1080;
        Height = 780;
        MinimumSize = new Size(640, 480);
        StartPosition = FormStartPosition.CenterScreen;
        _webView.Dock = DockStyle.Fill;
        Controls.Add(_webView);
        Load += OnLoad;
        FormClosed += (_, _) => _webView.Dispose();
    }

    private void Log(string message)
    {
        try
        {
            File.AppendAllText(_logPath, $"{DateTime.Now:HH:mm:ss} {message}{Environment.NewLine}");
        }
        catch
        {
            // 日志写入失败不影响阅读器运行
        }
    }

    private async void OnLoad(object? sender, EventArgs e)
    {
        try
        {
            Log($"BaseDirectory={AppContext.BaseDirectory}");
            await _webView.EnsureCoreWebView2Async();
            Log("CoreWebView2 initialized");
            var distDir = ResolveDistDir();
            Log($"distDir={distDir}");
            _webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                "appassets.local",
                distDir,
                CoreWebView2HostResourceAccessKind.Allow);
            _webView.CoreWebView2.NavigationCompleted += (_, args) =>
                Log($"NavigationCompleted success={args.IsSuccess} error={args.WebErrorStatus}");
            _webView.CoreWebView2.Navigate("https://appassets.local/index.html");
            Log("Navigating to https://appassets.local/index.html");
        }
        catch (Exception ex)
        {
            Log($"Error: {ex}");
            MessageBox.Show(
                $"初始化 WebView2 失败：{ex.Message}（日志：{_logPath}）",
                "novel-reading-demo",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }

    private static string ResolveDistDir()
    {
        var candidates = new List<string>();
        var baseDist = Path.Combine(AppContext.BaseDirectory, "dist");
        if (Directory.Exists(baseDist)) candidates.Add(baseDist);

        // 单文件模式下，嵌入内容会解压到临时目录，按最后修改时间取最新的
        var extractRoot = Path.Combine(Path.GetTempPath(), ".net", "novel-reading-demo");
        if (Directory.Exists(extractRoot))
        {
            candidates.AddRange(
                Directory.GetDirectories(extractRoot)
                    .Select(dir => Path.Combine(dir, "dist"))
                    .Where(Directory.Exists));
        }

        return candidates
                   .OrderByDescending(Directory.GetLastWriteTimeUtc)
                   .FirstOrDefault()
               ?? throw new DirectoryNotFoundException($"未找到 dist 目录，候选路径：{string.Join("; ", candidates)}");
    }
}
