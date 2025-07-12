// 从存储加载配置并更新UI
function loadOptions() {
  chrome.storage.sync.get({
      stayTime: 5,
      enableSwitching: false,
      shouldRefresh: true,
      noSwitchUrls: '',
      noRefreshUrls: ''
    }, (items) => {
    document.getElementById('stayTime').value = items.stayTime;
    document.getElementById('enableSwitching').checked = items.enableSwitching;
    document.getElementById('shouldRefresh').checked = items.shouldRefresh;
    document.getElementById('noSwitchUrls').value = items.noSwitchUrls;
    document.getElementById('noRefreshUrls').value = items.noRefreshUrls;
  });
}

// 保存配置到存储
function saveOptions() {
  const stayTime = parseInt(document.getElementById('stayTime').value);
  const enableSwitching = document.getElementById('enableSwitching').checked;
  const noSwitchUrls = document.getElementById('noSwitchUrls').value;
  const noRefreshUrls = document.getElementById('noRefreshUrls').value;

  const shouldRefresh = document.getElementById('shouldRefresh').checked;
    chrome.storage.sync.set({
      stayTime: stayTime,
      enableSwitching: enableSwitching,
      shouldRefresh: shouldRefresh,
      noSwitchUrls: noSwitchUrls,
      noRefreshUrls: noRefreshUrls
    }, () => {
    // 显示保存成功提示
    const status = document.getElementById('status');
    status.textContent = '配置已保存并生效';
    status.style.display = 'block';
    setTimeout(() => {
      status.style.display = 'none';
    }, 2000);
  });
}

// 页面加载时加载配置
document.addEventListener('DOMContentLoaded', loadOptions);

// 添加保存按钮点击事件监听
document.getElementById('saveSettings').addEventListener('click', saveOptions);