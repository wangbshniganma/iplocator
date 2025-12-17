(function () {
  const posBox = document.getElementById("posBox");
  const addrBox = document.getElementById("addrBox");
  const statusText = document.getElementById("statusText");
  const btnLocate = document.getElementById("btnLocate");

  let map, marker, circle, geocoder;

  function fmt(obj) { return JSON.stringify(obj, null, 2); }

  function assertAmapLoaded() {
    if (!window.AMap) {
      throw new Error("AMap 未加载：请检查 index.html 中的高德脚本是否成功加载（key/网络/扩展拦截）");
    }
  }

  function loadPlugin(name) {
    return new Promise((resolve, reject) => {
      try {
        assertAmapLoaded();
        AMap.plugin(name, () => {
          // 插件加载完成回调
          // 对 Geocoder 来说应出现 AMap.Geocoder 构造器
          resolve();
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  async function initMapAndPlugins() {
    assertAmapLoaded();

    statusText.textContent = "初始化地图...";
    map = new AMap.Map("map", { zoom: 12 });

    // 显式加载 Geocoder 插件（更稳）
    statusText.textContent = "加载 Geocoder 插件...";
    await loadPlugin("AMap.Geocoder");

    if (!AMap.Geocoder) {
      throw new Error("Geocoder 插件加载失败：AMap.Geocoder 不存在（可能被拦截或加载异常）");
    }

    geocoder = new AMap.Geocoder({
      radius: 1000,
      extensions: "all" // 需要 POI
    });

    marker = new AMap.Marker();
    map.add(marker);

    circle = new AMap.Circle({
      fillColor: "#1677ff33",
      strokeColor: "#1677ff",
      strokeWeight: 2
    });
    map.add(circle);

    statusText.textContent = "初始化完成";
  }

  function setMapPosition(lng, lat, accuracy) {
    const pos = new AMap.LngLat(lng, lat);
    marker.setPosition(pos);
    map.setCenter(pos);
    map.setZoom(16);

    if (typeof accuracy === "number" && !Number.isNaN(accuracy)) {
      circle.setCenter(pos);
      circle.setRadius(Math.max(accuracy, 10));
    }
  }

  function getCurrentPositionAsync() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("当前浏览器不支持 Geolocation"));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0
      });
    });
  }

function geocodeRegeoAsync(lng, lat, accuracy) {
  return new Promise((resolve, reject) => {
    geocoder.getAddress([lng, lat], (status, result) => {
      if (status === "complete" && result && result.regeocode) {
        resolve(result.regeocode);
        return;
      }

      if (status === "no_data") {
        reject({
          status,
          result,
          hint: "高德逆地理无数据：常见原因是定位点在境外/海上，或当前定位精度很差。",
          coords: { lng, lat, accuracy_m: accuracy }
        });
        return;
      }

      reject({ status, result, coords: { lng, lat, accuracy_m: accuracy } });
    });
  });
}

  function pickAddressFields(regeocode) {
    const ac = regeocode.addressComponent || {};
    const sn = ac.streetNumber || {};
    const pois = (regeocode.pois || []).slice(0, 5).map(p => ({
      name: p.name,
      type: p.type,
      distance_m: p.distance,
      address: p.address,
      location: p.location
    }));

    return {
      formatted_address: regeocode.formattedAddress,
      province: ac.province,
      city: Array.isArray(ac.city) ? "" : ac.city,
      district: ac.district,
      township: ac.township,
      street: sn.street,
      number: sn.number,
      adcode: ac.adcode,
      citycode: ac.citycode,
      pois_top5: pois
    };
  }

  function accuracyHint(accuracy) {
    if (typeof accuracy !== "number") return null;
    if (accuracy > 20000) {
      return "提示：当前精度非常差（>20km），可能是系统定位服务关闭/无Wi‑Fi/在室内/仅IP粗定位。建议打开系统定位服务、连接Wi‑Fi或用手机测试。";
    }
    if (accuracy > 2000) return "提示：当前精度较差（>2km）。";
    return null;
  }

  async function locateOnce() {
    statusText.textContent = "定位中（可能弹出权限请求）...";
    posBox.textContent = "定位中...";
    addrBox.textContent = "等待定位结果...";

    const pos = await getCurrentPositionAsync();
    const lng = pos.coords.longitude;
    const lat = pos.coords.latitude;
    const accuracy = pos.coords.accuracy;

    const info = {
      lng,
      lat,
      accuracy_m: accuracy,
      altitude: pos.coords.altitude,
      heading: pos.coords.heading,
      speed: pos.coords.speed,
      timestamp: new Date(pos.timestamp).toISOString()
    };

    const hint = accuracyHint(accuracy);
    posBox.textContent = hint ? (fmt(info) + "\n\n" + hint) : fmt(info);

    setMapPosition(lng, lat, accuracy);

    statusText.textContent = "解析地址中...";
    addrBox.textContent = "逆地理编码中...";
    const regeocode = await geocodeRegeoAsync(lng, lat, accuracy);
    addrBox.textContent = fmt(pickAddressFields(regeocode));

    statusText.textContent = "完成";
  }

  function showError(e) {
    statusText.textContent = "失败";
    if (e && typeof e === "object" && "code" in e && "message" in e) {
      // Geolocation error
      posBox.textContent = `定位失败：(${e.code}) ${e.message}`;
      return;
    }
    if (e && e.status) {
      addrBox.textContent = `逆地理编码失败：${fmt(e)}`;
      return;
    }
    posBox.textContent = `失败：${String(e?.message || e)}`;
  }

  async function boot() {
    try {
      await initMapAndPlugins();

      // 自动尝试一次（不保证所有浏览器都会弹窗，所以保留按钮兜底）
      setTimeout(() => {
        locateOnce().catch(err => {
          statusText.textContent = "自动定位未完成：请点击“重新获取定位”";
          // 把错误也展示出来，便于排查
          showError(err);
        });
      }, 300);
    } catch (e) {
      showError(e);
    }
  }

  btnLocate.addEventListener("click", async () => {
    btnLocate.disabled = true;
    try {
      await locateOnce();
    } catch (e) {
      showError(e);
    } finally {
      btnLocate.disabled = false;
    }
  });

  boot();
})();
