using Microsoft.Web.WebView2.WinForms;

namespace novel_reading_demo;

public class MainForm : Form
{
    private readonly WebView2 _webView = new();

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
    }

    private async void OnLoad(object? sender, EventArgs e)
    {
        try
        {
            await _webView.EnsureCoreWebView2Async();
            var indexPath = Path.Combine(AppContext.BaseDirectory, "dist", "index.html");
            _webView.CoreWebView2.Navigate(new Uri(indexPath).AbsoluteUri);
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"初始化 WebView2 失败：{ex.Message}",
                "novel-reading-demo",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }
}
