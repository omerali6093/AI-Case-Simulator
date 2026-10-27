;(function () {
  'use strict'
  /* =====================================================================
     2. 3D world (Three.js). Every call into WebGL lives in this section.
     ===================================================================== */
  function createWorld (canvas, hooks) {
    var T = window.THREE
    if (!T || !T.WebGLRenderer || !T.Scene) return null
    if (T.ColorManagement) T.ColorManagement.legacyMode = false

    var renderer = new T.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      powerPreference: 'default'
    })
    renderer.outputEncoding = T.sRGBEncoding
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = T.PCFSoftShadowMap

    var scene = new T.Scene()
    scene.background = new T.Color('#0b1d21')
    var camera = new T.PerspectiveCamera(46, 1, 0.05, 60)
    var reduce = !!(
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )

    function clamp (x, a, b) {
      return Math.max(a, Math.min(b, x))
    }
    function sm (x) {
      x = clamp(x, 0, 1)
      return x * x * (3 - 2 * x)
    }
    function angleDiff (a, b) {
      var d = a - b
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      return d
    }
    var seed = 11
    function rnd () {
      seed = (seed * 16807) % 2147483647
      return (seed - 1) / 2147483646
    }
    var Capsule =
      T.CapsuleGeometry ||
      function (r, len, cs, rs) {
        return new T.CylinderGeometry(r, r, len + 2 * r, rs || 8)
      }

    /* ---------- procedural textures (no image downloads) ---------- */
    function canvasTex (w, h, draw, repeat) {
      var c = document.createElement('canvas')
      c.width = w
      c.height = h
      draw(c.getContext('2d'), w, h)
      var t = new T.CanvasTexture(c)
      t.encoding = T.sRGBEncoding
      t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy())
      if (repeat) {
        t.wrapS = t.wrapT = T.RepeatWrapping
        t.repeat.set(repeat[0], repeat[1])
      }
      return t
    }
    var woodTex = canvasTex(
      512,
      512,
      function (g, w, h) {
        g.fillStyle = '#4e3220'
        g.fillRect(0, 0, w, h)
        var pw = h / 8
        for (var r = 0; r < 8; r++) {
          var x = -(r % 2) * w * 0.37
          while (x < w) {
            var len = w * (0.5 + rnd() * 0.4)
            g.fillStyle =
              'hsl(' +
              (27 + rnd() * 7) +
              ',' +
              (34 + rnd() * 10) +
              '%,' +
              (52 + rnd() * 9) +
              '%)'
            g.fillRect(x, r * pw, len - 2, pw - 2)
            g.strokeStyle = 'rgba(70,40,18,.12)'
            g.lineWidth = 1
            for (var k = 0; k < 5; k++) {
              var yy = r * pw + 3 + rnd() * (pw - 6)
              g.beginPath()
              g.moveTo(x, yy)
              g.bezierCurveTo(
                x + len * 0.3,
                yy + rnd() * 5 - 2.5,
                x + len * 0.6,
                yy + rnd() * 5 - 2.5,
                x + len,
                yy
              )
              g.stroke()
            }
            x += len
          }
        }
      },
      [4.5, 4]
    )
    var rugTex = canvasTex(512, 384, function (g, w, h) {
      function rr (x, y, ww, hh, r) {
        g.beginPath()
        g.moveTo(x + r, y)
        g.arcTo(x + ww, y, x + ww, y + hh, r)
        g.arcTo(x + ww, y + hh, x, y + hh, r)
        g.arcTo(x, y + hh, x, y, r)
        g.arcTo(x, y, x + ww, y, r)
        g.closePath()
      }
      rr(8, 8, w - 16, h - 16, 40)
      g.fillStyle = '#2e8f93'
      g.fill()
      rr(30, 30, w - 60, h - 60, 28)
      g.strokeStyle = 'rgba(255,255,255,.5)'
      g.lineWidth = 4
      g.stroke()
      rr(52, 52, w - 104, h - 104, 18)
      g.fillStyle = '#1f6f78'
      g.fill()
      g.strokeStyle = 'rgba(255,255,255,.18)'
      g.lineWidth = 2
      for (var i = 0; i < 6; i++) {
        g.beginPath()
        g.arc(w / 2, h / 2, 30 + i * 22, 0, Math.PI * 2)
        g.stroke()
      }
    })
    var skyTex = canvasTex(512, 256, function (g, w, h) {
      var gr = g.createLinearGradient(0, 0, 0, h)
      gr.addColorStop(0, '#6fbdf0')
      gr.addColorStop(0.7, '#cdeafc')
      gr.addColorStop(1, '#f2fbff')
      g.fillStyle = gr
      g.fillRect(0, 0, w, h)
      for (var i = 0; i < 9; i++) {
        var cx = rnd() * w,
          cy = 30 + rnd() * 110,
          rr = 24 + rnd() * 36
        var rg = g.createRadialGradient(cx, cy, 2, cx, cy, rr)
        rg.addColorStop(0, 'rgba(255,255,255,.95)')
        rg.addColorStop(1, 'rgba(255,255,255,0)')
        g.fillStyle = rg
        g.fillRect(cx - rr, cy - rr, rr * 2, rr * 2)
      }
      g.fillStyle = 'rgba(120,150,175,.55)'
      for (var b = 0; b < 14; b++) {
        var bw = 22 + rnd() * 34,
          bh = 30 + rnd() * 70
        g.fillRect(b * 38 + rnd() * 10, h - bh, bw, bh)
      }
    })
    function posterTex (title, accent, draw2) {
      return canvasTex(300, 420, function (g, w, h) {
        g.fillStyle = '#f8fbfb'
        g.fillRect(0, 0, w, h)
        g.fillStyle = accent
        g.fillRect(0, 0, w, 74)
        g.fillStyle = '#fff'
        g.font = '700 26px sans-serif'
        g.textAlign = 'center'
        g.fillText(title, w / 2, 46)
        draw2(g, w, h)
      })
    }
    var posterHeart = posterTex('HEALTHY HEART', '#0f766e', function (g, w) {
      g.strokeStyle = '#d6453d'
      g.lineWidth = 4
      g.beginPath()
      g.moveTo(20, 150)
      ;[
        [70, 150],
        [85, 150],
        [100, 105],
        [118, 195],
        [136, 125],
        [150, 150],
        [280, 150]
      ].forEach(function (p) {
        g.lineTo(p[0], p[1])
      })
      g.stroke()
      g.fillStyle = '#d6453d'
      g.beginPath()
      g.moveTo(150, 290)
      g.bezierCurveTo(60, 230, 90, 190, 150, 235)
      g.bezierCurveTo(210, 190, 240, 230, 150, 290)
      g.fill()
      g.fillStyle = '#35575a'
      g.font = '600 18px sans-serif'
      g.textAlign = 'center'
      g.fillText('Move daily', w / 2, 335)
      g.fillText('Eat well', w / 2, 362)
      g.fillText('Sleep enough', w / 2, 389)
    })
    var posterHands = posterTex('WASH HANDS', '#2f6fa3', function (g, w) {
      for (var i = 0; i < 5; i++) {
        g.fillStyle = '#d7e9f5'
        g.beginPath()
        g.arc(60 + i * 45, 150, 19, 0, 7)
        g.fill()
        g.fillStyle = '#2f6fa3'
        g.font = '700 18px sans-serif'
        g.textAlign = 'center'
        g.fillText(String(i + 1), 60 + i * 45, 157)
      }
      g.fillStyle = '#35575a'
      g.font = '600 18px sans-serif'
      g.fillText('Wet and soap', w / 2, 230)
      g.fillText('Scrub 20 seconds', w / 2, 262)
      g.fillText('Rinse and dry', w / 2, 294)
    })
    var clockTex = canvasTex(256, 256, function (g, w) {
      g.fillStyle = '#f7fafa'
      g.beginPath()
      g.arc(128, 128, 124, 0, 7)
      g.fill()
      g.strokeStyle = '#1d3a3d'
      g.lineWidth = 6
      g.beginPath()
      g.arc(128, 128, 120, 0, 7)
      g.stroke()
      for (var i = 0; i < 12; i++) {
        var a = (i / 12) * Math.PI * 2
        g.lineWidth = i % 3 ? 3 : 6
        g.beginPath()
        g.moveTo(128 + Math.sin(a) * 100, 128 - Math.cos(a) * 100)
        g.lineTo(128 + Math.sin(a) * 114, 128 - Math.cos(a) * 114)
        g.stroke()
      }
    })
    var dustTex = canvasTex(64, 64, function (g) {
      var rg = g.createRadialGradient(32, 32, 1, 32, 32, 30)
      rg.addColorStop(0, 'rgba(255,248,225,1)')
      rg.addColorStop(1, 'rgba(255,248,225,0)')
      g.fillStyle = rg
      g.fillRect(0, 0, 64, 64)
    })
    var emrCanvas = document.createElement('canvas')
    emrCanvas.width = 512
    emrCanvas.height = 320
    var emrTex = new T.CanvasTexture(emrCanvas)
    emrTex.encoding = T.sRGBEncoding
    function drawEMR (name, age) {
      var g = emrCanvas.getContext('2d')
      g.fillStyle = '#0d2a30'
      g.fillRect(0, 0, 512, 320)
      g.fillStyle = '#14a39a'
      g.fillRect(0, 0, 512, 46)
      g.fillStyle = '#fff'
      g.font = '700 22px sans-serif'
      g.textAlign = 'left'
      g.fillText('CLINIC  |  Educational record', 16, 31)
      g.fillStyle = '#e9f8f5'
      g.font = '700 30px sans-serif'
      g.fillText(name || 'No patient', 20, 98)
      g.fillStyle = '#9dbfba'
      g.font = '600 20px sans-serif'
      g.fillText(
        age ? 'Age ' + age + '  |  fictional case' : 'Waiting room is empty',
        20,
        130
      )
      g.strokeStyle = '#5eead4'
      g.lineWidth = 3
      g.beginPath()
      g.moveTo(20, 215)
      for (var x = 0; x < 470; x += 5) {
        var y =
          215 - (x % 94 > 40 && x % 94 < 52 ? 60 : 0) + Math.sin(x * 0.2) * 3
        g.lineTo(20 + x, y)
      }
      g.stroke()
      g.fillStyle = '#5eead4'
      g.font = '700 18px sans-serif'
      g.fillText('HR 78', 20, 290)
      g.fillText('BP 118/76', 150, 290)
      g.fillText('SpO2 98%', 330, 290)
      emrTex.needsUpdate = true
    }
    drawEMR('', 0)

    /* ---------- materials, batching ---------- */
    var cache = {}
    function M (hex, o) {
      o = o || {}
      var key = [hex, o.r, o.m, o.e, o.ei, o.env, o.ds ? 1 : 0, o.op].join('|')
      if (cache[key]) return cache[key]
      var m = new T.MeshStandardMaterial({
        color: hex,
        roughness: o.r == null ? 0.78 : o.r,
        metalness: o.m || 0,
        envMapIntensity: o.env == null ? 0.45 : o.env
      })
      if (o.e) {
        m.emissive = new T.Color(o.e)
        m.emissiveIntensity = o.ei || 1
      }
      if (o.ds) m.side = T.DoubleSide
      if (o.op != null) {
        m.transparent = true
        m.opacity = o.op
        m.depthWrite = false
      }
      cache[key] = m
      return m
    }
    function fm (hex, r) {
      return new T.MeshStandardMaterial({
        color: hex,
        roughness: r == null ? 0.7 : r,
        metalness: 0,
        envMapIntensity: 0.35
      })
    }

    var batches = {}
    var xf = new T.Object3D()
    function stat (geo, mat, x, y, z, rx, ry, rz, sx, sy, sz) {
      xf.position.set(x || 0, y || 0, z || 0)
      xf.rotation.set(rx || 0, ry || 0, rz || 0)
      xf.scale.set(sx || 1, sy || 1, sz || 1)
      xf.updateMatrix()
      geo.applyMatrix4(xf.matrix)
      var b = batches[mat.uuid] || (batches[mat.uuid] = { mat: mat, geos: [] })
      b.geos.push(geo)
    }
    function box (w, h, d, mat, x, y, z, ry, rx, rz) {
      stat(new T.BoxGeometry(w, h, d), mat, x, y, z, rx, ry, rz)
    }
    function cyl (rt, rb, h, mat, x, y, z, seg, rx, rz) {
      stat(
        new T.CylinderGeometry(rt, rb, h, seg || 12),
        mat,
        x,
        y,
        z,
        rx,
        0,
        rz
      )
    }
    function ball (r, mat, x, y, z, sx, sy, sz) {
      stat(new T.SphereGeometry(r, 12, 9), mat, x, y, z, 0, 0, 0, sx, sy, sz)
    }
    function mergeGeos (list) {
      var vc = 0,
        ic = 0,
        i
      list.forEach(function (g) {
        vc += g.attributes.position.count
        ic += g.index ? g.index.count : g.attributes.position.count
      })
      var pos = new Float32Array(vc * 3),
        nor = new Float32Array(vc * 3),
        uv = new Float32Array(vc * 2)
      var idx = vc > 65535 ? new Uint32Array(ic) : new Uint16Array(ic),
        vo = 0,
        io = 0
      list.forEach(function (g) {
        var p = g.attributes.position,
          n = g.attributes.normal,
          u = g.attributes.uv
        pos.set(p.array, vo * 3)
        nor.set(n.array, vo * 3)
        if (u) uv.set(u.array, vo * 2)
        if (g.index) {
          for (i = 0; i < g.index.count; i++)
            idx[io + i] = g.index.array[i] + vo
          io += g.index.count
        } else {
          for (i = 0; i < p.count; i++) idx[io + i] = vo + i
          io += p.count
        }
        vo += p.count
      })
      var out = new T.BufferGeometry()
      out.setAttribute('position', new T.BufferAttribute(pos, 3))
      out.setAttribute('normal', new T.BufferAttribute(nor, 3))
      out.setAttribute('uv', new T.BufferAttribute(uv, 2))
      out.setIndex(new T.BufferAttribute(idx, 1))
      return out
    }
    function flush () {
      Object.keys(batches).forEach(function (k) {
        var b = batches[k]
        var mesh = new T.Mesh(mergeGeos(b.geos), b.mat)
        mesh.castShadow = true
        mesh.receiveShadow = true
        scene.add(mesh)
      })
      batches = {}
    }
    function dyn (geo, mat, x, y, z, parent, cast) {
      var m = new T.Mesh(geo, mat)
      m.position.set(x || 0, y || 0, z || 0)
      if (cast) m.castShadow = true
      ;(parent || scene).add(m)
      return m
    }

    /* ---------- the room ---------- */
    var WALL = M('#e8efee', { r: 0.92 }),
      WALL2 = M('#dde8e7', { r: 0.92 }),
      TEAL = M('#1f8189', { r: 0.5 }),
      TEALD = M('#134e55', { r: 0.6 })
    var WOOD = M('#7a4d31', { r: 0.42, env: 0.6 }),
      WOODL = M('#cdaa78', { r: 0.5 }),
      WHITE = M('#f4f7f7', { r: 0.5 }),
      CHROME = M('#cfd8da', { r: 0.22, m: 0.9, env: 1 })
    var DARK = M('#1b2326', { r: 0.5 }),
      FABRIC = M('#2b858c', { r: 0.9 }),
      FABRIC2 = M('#5f8196', { r: 0.9 }),
      GREEN = M('#3b8c58', { r: 0.8 }),
      GREEN2 = M('#58a871', { r: 0.8 })
    var LED = M('#8ff5e5', { r: 0.4, e: '#7ff0e0', ei: 3 })

    var floor = new T.Mesh(
      new T.PlaneGeometry(9, 8),
      new T.MeshStandardMaterial({
        map: woodTex,
        roughness: 0.4,
        metalness: 0,
        envMapIntensity: 0.55
      })
    )
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    scene.add(floor)
    var ceil = new T.Mesh(new T.PlaneGeometry(9, 8), M('#f2f7f7', { r: 0.95 }))
    ceil.rotation.x = Math.PI / 2
    ceil.position.y = 3.2
    scene.add(ceil)

    stat(new T.PlaneGeometry(9, 3.2), WALL, 0, 1.6, -4)
    stat(new T.PlaneGeometry(8, 3.2), WALL2, -4.5, 1.6, 0, 0, Math.PI / 2, 0)
    box(6.2, 3.2, 0.2, WALL, -1.4, 1.6, 4.1)
    box(1.8, 3.2, 0.2, WALL, 3.6, 1.6, 4.1)
    box(1.0, 1.1, 0.2, WALL, 2.2, 2.65, 4.1)
    box(1.3, 3.2, 0.2, WALL2, 4.6, 1.6, -3.35)
    box(3.7, 3.2, 0.2, WALL2, 4.6, 1.6, 2.15)
    box(0.2, 0.9, 3.0, WALL2, 4.6, 0.45, -1.2, 0)
    box(0.2, 0.7, 3.0, WALL2, 4.6, 2.85, -1.2, 0)
    box(0.2, 0.9, 3.0, WALL2, 4.6, 0.45, -1.2)
    box(0.2, 0.7, 3.0, WALL2, 4.6, 2.85, -1.2)
    // baseboards
    box(9, 0.1, 0.03, WHITE, 0, 0.05, -3.985)
    box(0.03, 0.1, 8, WHITE, -4.485, 0.05, 0)
    box(6.2, 0.1, 0.03, WHITE, -1.4, 0.05, 3.985)
    box(0.03, 0.1, 3.7, WHITE, 4.485, 0.05, 2.15)
    // window frame, sill, blinds
    box(0.08, 0.06, 3.1, WHITE, 4.45, 0.9, -1.2)
    box(0.08, 0.06, 3.1, WHITE, 4.45, 2.5, -1.2)
    box(0.08, 1.64, 0.06, WHITE, 4.45, 1.7, -2.72)
    box(0.08, 1.64, 0.06, WHITE, 4.45, 1.7, 0.32)
    box(0.08, 1.64, 0.04, WHITE, 4.45, 1.7, -1.2)
    box(0.3, 0.04, 3.2, WHITE, 4.34, 0.92, -1.2)
    for (var bl = 0; bl < 9; bl++)
      box(
        0.02,
        0.035,
        2.9,
        M('#e8eeee', { r: 0.6 }),
        4.4,
        2.46 - bl * 0.055,
        -1.2,
        0,
        0.5
      )
    var sky = new T.Mesh(
      new T.PlaneGeometry(3.0, 1.6),
      new T.MeshBasicMaterial({
        map: skyTex,
        color: new T.Color(1.5, 1.5, 1.55)
      })
    )
    sky.position.set(4.62, 1.7, -1.2)
    sky.rotation.y = -Math.PI / 2
    scene.add(sky)

    // door, frame, hinged leaf, bright corridor beyond
    box(0.06, 2.1, 0.22, WOODL, 1.7, 1.05, 4.0)
    box(0.06, 2.1, 0.22, WOODL, 2.7, 1.05, 4.0)
    box(1.06, 0.06, 0.22, WOODL, 2.2, 2.13, 4.0)
    var corrMat = new T.MeshBasicMaterial({
      color: new T.Color(1.35, 1.5, 1.55)
    })
    var cw = new T.Mesh(new T.PlaneGeometry(6, 3.2), corrMat)
    cw.position.set(2.2, 1.6, 7.2)
    cw.rotation.y = Math.PI
    scene.add(cw)
    var cf = new T.Mesh(new T.PlaneGeometry(6, 3.2), M('#b9c9cb', { r: 0.6 }))
    cf.rotation.x = -Math.PI / 2
    cf.position.set(2.2, 0.001, 5.6)
    scene.add(cf)
    ;[
      [-0.8, 1],
      [5.2, -1]
    ].forEach(function (s) {
      var w = new T.Mesh(
        new T.PlaneGeometry(3.2, 3.2),
        M('#dfe8e8', { r: 0.9 })
      )
      w.position.set(s[0], 1.6, 5.6)
      w.rotation.y = s[1] > 0 ? Math.PI / 2 : -Math.PI / 2
      scene.add(w)
    })
    var hinge = new T.Group()
    hinge.position.set(2.7, 0, 4.02)
    scene.add(hinge)
    dyn(
      new T.BoxGeometry(1.0, 2.08, 0.05),
      M('#9a6b43', { r: 0.5 }),
      -0.5,
      1.04,
      0,
      hinge,
      true
    )
    dyn(new T.SphereGeometry(0.035, 8, 6), CHROME, -0.88, 1.0, -0.05, hinge)

    // clock above the door
    var clockG = new T.Group()
    clockG.position.set(2.2, 2.68, 3.94)
    clockG.rotation.y = Math.PI
    scene.add(clockG)
    dyn(
      new T.CircleGeometry(0.22, 32),
      new T.MeshStandardMaterial({ map: clockTex, roughness: 0.6 }),
      0,
      0,
      0,
      clockG
    )
    var hourH = dyn(
      new T.BoxGeometry(0.014, 0.1, 0.006),
      DARK,
      0,
      0,
      0.004,
      clockG
    )
    hourH.geometry.translate(0, 0.045, 0)
    var minH = dyn(
      new T.BoxGeometry(0.01, 0.16, 0.006),
      DARK,
      0,
      0,
      0.008,
      clockG
    )
    minH.geometry.translate(0, 0.07, 0)

    // wall behind the doctor: teal slats, glowing strip, cross sign
    box(3.9, 2.6, 0.02, TEALD, 0, 1.5, -3.975)
    for (var sl = 0; sl < 28; sl++)
      box(
        0.08,
        2.5,
        0.06,
        sl % 2 ? TEAL : M('#25939a', { r: 0.5 }),
        -1.89 + sl * 0.14,
        1.45,
        -3.94
      )
    box(0.025, 2.5, 0.012, LED, -1.99, 1.45, -3.92)
    box(0.025, 2.5, 0.012, LED, 1.99, 1.45, -3.92)
    box(0.52, 0.15, 0.03, LED, 0, 2.3, -3.89)
    box(0.15, 0.52, 0.03, LED, 0, 2.3, -3.89)
    // shelf with books and plant
    box(1.3, 0.04, 0.3, WOOD, 3.1, 1.5, -3.85)
    ;[
      '#d9534f',
      '#e0a93b',
      '#3f87c4',
      '#58a871',
      '#8a63c4',
      '#d9534f',
      '#3f87c4'
    ].forEach(function (c, i) {
      box(
        0.05,
        0.22 + (i % 3) * 0.04,
        0.2,
        M(c, { r: 0.7 }),
        2.6 + i * 0.065,
        1.63 + (i % 3) * 0.02,
        -3.85
      )
    })
    cyl(0.07, 0.055, 0.12, M('#c7a98c'), 3.6, 1.58, -3.85)
    ball(0.1, GREEN, 3.6, 1.76, -3.85)
    ball(0.08, GREEN2, 3.66, 1.86, -3.83)
    // ceiling light panels
    var panelMat = new T.MeshBasicMaterial({
      color: new T.Color(2.6, 2.6, 2.5)
    })
    ;[
      [-2, -1.2],
      [2, -1.2],
      [0, 1.9],
      [-2.4, 2.4]
    ].forEach(function (p) {
      var m = new T.Mesh(new T.PlaneGeometry(1.5, 0.5), panelMat)
      m.rotation.x = Math.PI / 2
      m.position.set(p[0], 3.19, p[1])
      scene.add(m)
    })

    // desk and accessories
    box(2.0, 0.05, 0.9, WOOD, 0, 0.755, -0.35)
    box(0.04, 0.73, 0.82, WOOD, -0.95, 0.365, -0.35)
    box(0.04, 0.73, 0.82, WOOD, 0.95, 0.365, -0.35)
    box(1.88, 0.5, 0.03, M('#6a4129', { r: 0.5 }), 0, 0.5, 0.05)
    box(0.42, 0.5, 0.78, M('#6a4129', { r: 0.5 }), -0.72, 0.5, -0.35)
    box(0.1, 0.012, 0.02, CHROME, -0.72, 0.62, 0.065)
    box(0.1, 0.012, 0.02, CHROME, -0.72, 0.42, 0.065)
    box(0.42, 0.015, 0.14, DARK, 0.0, 0.787, -0.55)
    box(0.06, 0.02, 0.1, DARK, 0.32, 0.79, -0.55)
    box(0.26, 0.015, 0.2, DARK, 0.55, 0.787, -0.52)
    box(0.04, 0.2, 0.04, DARK, 0.55, 0.89, -0.5, 0.25)
    box(0.66, 0.4, 0.03, DARK, 0.55, 1.13, -0.48, 0.25)
    box(
      0.3,
      0.06,
      0.08,
      M('#d4b060', { r: 0.3, m: 0.8, env: 1 }),
      -0.25,
      0.8,
      0.0
    )
    cyl(0.04, 0.035, 0.09, M('#2f6fa3'), 0.85, 0.82, -0.2)
    box(0.008, 0.12, 0.008, M('#d6453d'), 0.84, 0.9, -0.2, 0, 0.1)
    box(0.008, 0.12, 0.008, DARK, 0.86, 0.9, -0.2, 0, -0.15)
    box(0.24, 0.012, 0.32, WHITE, -0.55, 0.785, -0.15, 0.3)
    box(0.2, 0.012, 0.02, M('#0f766e'), -0.55, 0.793, -0.01, 0.3)
    box(0.16, 0.1, 0.1, M('#e5f0ee'), 0.0, 0.81, -0.12)
    box(0.1, 0.04, 0.06, WHITE, 0.0, 0.88, -0.12)
    // desk lamp
    cyl(0.09, 0.1, 0.02, DARK, -0.8, 0.79, -0.6)
    cyl(0.012, 0.012, 0.36, DARK, -0.8, 0.97, -0.6)
    box(0.22, 0.014, 0.014, DARK, -0.7, 1.15, -0.6, 0, 0, -0.2)
    cyl(
      0.025,
      0.06,
      0.08,
      M('#f2d9a0', { r: 0.4, e: '#ffd38a', ei: 2.2 }),
      -0.58,
      1.1,
      -0.6,
      10
    )
    // doctor's rolling chair
    var dChair = new T.Group()
    dChair.position.set(0, 0, -1.25)
    scene.add(dChair)
    var seatM = FABRIC
    dyn(new T.BoxGeometry(0.5, 0.07, 0.5), seatM, 0, 0.4, 0, dChair, true)
    var back = dyn(
      new T.BoxGeometry(0.48, 0.55, 0.07),
      seatM,
      0,
      0.72,
      -0.22,
      dChair,
      true
    )
    back.rotation.x = -0.12
    dyn(new T.BoxGeometry(0.04, 0.04, 0.3), DARK, -0.27, 0.58, 0, dChair)
    dyn(new T.BoxGeometry(0.04, 0.04, 0.3), DARK, 0.27, 0.58, 0, dChair)
    dyn(new T.CylinderGeometry(0.03, 0.03, 0.3, 8), CHROME, 0, 0.22, 0, dChair)
    for (var st = 0; st < 5; st++) {
      var arm = dyn(
        new T.BoxGeometry(0.3, 0.03, 0.05),
        DARK,
        0,
        0.06,
        0,
        dChair
      )
      arm.rotation.y = (st * Math.PI * 2) / 5
      arm.translateX(0.15)
      dyn(
        new T.SphereGeometry(0.03, 8, 6),
        DARK,
        Math.cos((-st * Math.PI * 2) / 5) * 0.3,
        0.03,
        Math.sin((-st * Math.PI * 2) / 5) * 0.3,
        dChair
      )
    }
    // patient's chair (moves when the patient sits and stands)
    var chairP = new T.Group()
    chairP.position.set(0, 0, 0.85)
    chairP.rotation.y = Math.PI
    scene.add(chairP)
    dyn(new T.BoxGeometry(0.5, 0.05, 0.48), FABRIC2, 0, 0.4, 0, chairP, true)
    dyn(
      new T.BoxGeometry(0.5, 0.3, 0.05),
      FABRIC2,
      0,
      0.72,
      -0.22,
      chairP,
      true
    )
    ;[
      [-0.22, -0.2],
      [0.22, -0.2],
      [-0.22, 0.2],
      [0.22, 0.2]
    ].forEach(function (p) {
      dyn(
        new T.CylinderGeometry(0.018, 0.018, 0.4, 6),
        CHROME,
        p[0],
        0.2,
        p[1],
        chairP,
        true
      )
    })
    dyn(new T.BoxGeometry(0.03, 0.34, 0.03), CHROME, -0.22, 0.58, -0.22, chairP)
    dyn(new T.BoxGeometry(0.03, 0.34, 0.03), CHROME, 0.22, 0.58, -0.22, chairP)
    // rug
    var rug = new T.Mesh(
      new T.PlaneGeometry(2.8, 2.1),
      new T.MeshStandardMaterial({
        map: rugTex,
        transparent: true,
        roughness: 0.95
      })
    )
    rug.rotation.x = -Math.PI / 2
    rug.position.set(0, 0.012, -0.2)
    rug.receiveShadow = true
    scene.add(rug)
    // exam bed and curtain
    box(0.9, 0.45, 2.0, WHITE, -3.5, 0.25, -2.5)
    box(0.86, 0.12, 1.96, M('#5aa6c0', { r: 0.8 }), -3.5, 0.52, -2.5)
    box(0.86, 0.1, 0.55, M('#5aa6c0', { r: 0.8 }), -3.5, 0.66, -3.25, 0, -0.35)
    box(0.5, 0.1, 0.3, WHITE, -3.5, 0.72, -3.55)
    cyl(0.05, 0.05, 0.84, WHITE, -3.5, 0.56, -1.45, 10, 0, Math.PI / 2)
    box(0.03, 1.9, 0.03, CHROME, -2.9, 0.95, -0.9)
    box(0.03, 1.9, 0.03, CHROME, -2.9, 0.95, -2.1)
    box(0.03, 0.03, 1.3, CHROME, -2.9, 1.9, -1.5)
    for (var cp = 0; cp < 10; cp++)
      box(
        0.025,
        1.75,
        0.12,
        M(cp % 2 ? '#bfe0dd' : '#a9d3cf', { r: 0.95 }),
        -2.9 + (cp % 2) * 0.03,
        1.0,
        -0.95 - cp * 0.12
      )
    // glass medicine cabinet, sink, mirror
    box(0.45, 1.7, 1.0, M('#e3ecec', { r: 0.6 }), -4.22, 0.85, 1.4)
    ;[
      [0.35, '#d6453d'],
      [0.75, '#3f87c4'],
      [1.15, '#e0a93b'],
      [1.5, '#58a871']
    ].forEach(function (r) {
      for (var j = 0; j < 4; j++)
        box(
          0.08,
          0.16,
          0.09,
          M(j % 2 ? r[1] : '#f2f6f6', { r: 0.6 }),
          -4.0,
          r[0],
          1.1 + j * 0.2
        )
    })
    var glassDoor = new T.Mesh(
      new T.BoxGeometry(0.02, 1.55, 0.92),
      new T.MeshStandardMaterial({
        color: '#cfeff0',
        roughness: 0.05,
        metalness: 0.1,
        transparent: true,
        opacity: 0.25,
        envMapIntensity: 1.2,
        depthWrite: false
      })
    )
    glassDoor.position.set(-3.98, 0.85, 1.4)
    scene.add(glassDoor)
    box(0.6, 0.9, 1.6, WHITE, -4.2, 0.45, 2.9)
    box(0.62, 0.04, 1.62, M('#cfd8d8', { r: 0.4 }), -4.2, 0.92, 2.9)
    cyl(
      0.17,
      0.15,
      0.03,
      M('#8e9a9c', { r: 0.3, m: 0.6 }),
      -4.22,
      0.935,
      2.9,
      20
    )
    cyl(0.012, 0.012, 0.22, CHROME, -4.4, 1.03, 2.9)
    box(0.12, 0.014, 0.014, CHROME, -4.34, 1.14, 2.9)
    box(
      0.02,
      0.8,
      1.0,
      M('#d9e6e8', { r: 0.04, m: 1, env: 1.3 }),
      -4.48,
      1.75,
      2.9
    )
    box(0.1, 0.2, 0.06, WHITE, 1.35, 1.3, 3.93)
    box(0.04, 0.06, 0.07, M('#14a39a'), 1.35, 1.38, 3.9)
    // plants
    function plant (x, z, s) {
      cyl(0.2 * s, 0.15 * s, 0.4 * s, M('#c9ab8f', { r: 0.8 }), x, 0.2 * s, z)
      cyl(0.19 * s, 0.19 * s, 0.02, M('#3a2a1e'), x, 0.4 * s, z)
      for (var i = 0; i < 8; i++) {
        var a = i * 0.8
        ball(
          0.2 * s,
          i % 2 ? GREEN : GREEN2,
          x + Math.cos(a) * 0.12 * s,
          (0.62 + (i % 3) * 0.17) * s,
          z + Math.sin(a) * 0.12 * s,
          0.8,
          1.35,
          0.8
        )
      }
    }
    plant(3.7, -3.5, 1.5)
    plant(-4.0, 3.5, 1.2)
    plant(0.9, 3.55, 1.0)
    flush()

    // framed posters (flat planes, drawn on top of the walls)
    function poster (tex, w, h, x, y, z, ry) {
      var f = new T.Mesh(
        new T.BoxGeometry(w + 0.06, h + 0.06, 0.03),
        M('#f3f5f5', { r: 0.5 })
      )
      f.position.set(x, y, z)
      f.rotation.y = ry
      scene.add(f)
      var p = new T.Mesh(
        new T.PlaneGeometry(w, h),
        new T.MeshStandardMaterial({ map: tex, roughness: 0.85 })
      )
      p.position.set(0, 0, 0.0165)
      f.add(p)
    }
    poster(posterHeart, 0.75, 1.05, -2.6, 1.65, 3.96, Math.PI)
    poster(posterHands, 0.6, 0.84, 0.15, 1.6, 3.96, Math.PI)
    poster(posterHands, 0.7, 0.98, -4.46, 1.7, -0.6, Math.PI / 2)
    // monitor screen
    var screen = new T.Mesh(
      new T.PlaneGeometry(0.6, 0.36),
      new T.MeshBasicMaterial({
        map: emrTex,
        color: new T.Color(1.25, 1.25, 1.25)
      })
    )
    screen.position.set(0.55 - 0.0075, 1.13, -0.48 - 0.0155)
    screen.rotation.y = Math.PI + 0.25
    // plane faces -z when rotated PI; offset it slightly toward the doctor
    screen.position.set(0.55 - 0.004, 1.13, -0.48 - 0.016)
    scene.add(screen)

    /* ---------- lighting ---------- */
    scene.add(new T.HemisphereLight('#e6f8f5', '#8a9d9b', 0.5))
    var sun = new T.DirectionalLight('#ffe8c4', 2.3)
    sun.position.set(14, 7, -1.2)
    sun.target.position.set(2, 0, -1.2)
    scene.add(sun.target)
    scene.add(sun)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.left = -8
    sun.shadow.camera.right = 8
    sun.shadow.camera.top = 8
    sun.shadow.camera.bottom = -8
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 40
    sun.shadow.bias = -0.0006
    sun.shadow.normalBias = 0.03
    var warm = new T.PointLight('#ffd9a8', 0.55, 8)
    warm.position.set(0, 2.7, -0.6)
    scene.add(warm)
    var cool = new T.PointLight('#8fe8e0', 0.4, 8)
    cool.position.set(-3, 2.5, 2.2)
    scene.add(cool)
    var pmrem, envRT
    try {
      if (T.RoomEnvironment && T.PMREMGenerator) {
        pmrem = new T.PMREMGenerator(renderer)
        envRT = pmrem.fromScene(new T.RoomEnvironment(), 0.04)
        scene.environment = envRT.texture
      }
    } catch (e) {
      console.warn('Environment map skipped', e)
    }

    // drifting dust in the sunbeam
    var DUST = 140,
      dustPos = new Float32Array(DUST * 3),
      dustSeed = []
    for (var di = 0; di < DUST; di++) {
      dustPos[di * 3] = 0.3 + rnd() * 3.8
      dustPos[di * 3 + 1] = 0.3 + rnd() * 2.3
      dustPos[di * 3 + 2] = -2.6 + rnd() * 2.9
      dustSeed.push(rnd() * 6.28)
    }
    var dustGeo = new T.BufferGeometry()
    dustGeo.setAttribute('position', new T.BufferAttribute(dustPos, 3))
    var dust = new T.Points(
      dustGeo,
      new T.PointsMaterial({
        map: dustTex,
        size: 0.05,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        blending: T.AdditiveBlending,
        color: '#fff2d0'
      })
    )
    dust.frustumCulled = false
    scene.add(dust)

    /* ---------- characters: stylised, rigged from primitives ---------- */
    function makeFigure (cfg) {
      var F = {
        seat: 0,
        walkAmt: 0,
        phase: 0,
        speaking: false,
        mode: 'rest',
        seed: rnd() * 6,
        blinkAt: 2 + rnd() * 2,
        blink: 0,
        lookYaw: 0,
        headPitch: 0.04,
        cfg: cfg
      }
      var skin = fm(cfg.skin, 0.55),
        hairM = fm(cfg.hair, 0.4),
        topM = fm(cfg.top, 0.85),
        botM = fm(cfg.bottom, 0.85),
        shoeM = fm(cfg.shoe || '#252d31', 0.5)
      var root = new T.Group()
      F.root = root
      function mesh (geo, mat, x, y, z, parent) {
        var m = new T.Mesh(geo, mat)
        m.position.set(x, y, z)
        m.castShadow = true
        parent.add(m)
        return m
      }

      var hips = new T.Group()
      hips.position.y = 0.83
      root.add(hips)
      F.hips = hips
      mesh(
        new T.CylinderGeometry(0.165, 0.15, 0.2, 14),
        botM,
        0,
        0,
        0,
        hips
      ).scale.z = 0.8
      var spine = new T.Group()
      hips.add(spine)
      F.spine = spine
      var torso = mesh(
        new T.CylinderGeometry(0.175, 0.155, 0.5, 16),
        topM,
        0,
        0.27,
        0,
        spine
      )
      torso.scale.z = 0.74
      mesh(
        new T.CylinderGeometry(0.052, 0.058, 0.12, 10),
        skin,
        0,
        0.55,
        0,
        spine
      )
      var collar = mesh(
        new T.TorusGeometry(0.062, 0.02, 8, 16),
        topM,
        0,
        0.51,
        0,
        spine
      )
      collar.rotation.x = Math.PI / 2

      if (cfg.coat) {
        var coatM = fm('#f7fafa', 0.7)
        coatM.side = T.DoubleSide
        var coat = mesh(
          new T.CylinderGeometry(
            0.19,
            0.17,
            0.52,
            18,
            1,
            true,
            0.5,
            Math.PI * 2 - 1.0
          ),
          coatM,
          0,
          0.27,
          0,
          spine
        )
        coat.scale.z = 0.76
        var skirt = mesh(
          new T.CylinderGeometry(
            0.2,
            0.27,
            0.3,
            18,
            1,
            true,
            0.95,
            Math.PI * 2 - 1.9
          ),
          coatM,
          0,
          -0.12,
          0,
          hips
        )
        skirt.scale.z = 0.8
        mesh(
          new T.BoxGeometry(0.07, 0.04, 0.008),
          fm('#14a39a', 0.5),
          0.1,
          0.34,
          0.125,
          spine
        )
      }
      if (cfg.stetho) {
        var sm1 = fm('#1d2427', 0.4),
          sc = fm('#cfd8da', 0.25)
        var ring = mesh(
          new T.TorusGeometry(0.105, 0.009, 6, 20),
          sm1,
          0,
          0.5,
          0.01,
          spine
        )
        ring.rotation.x = Math.PI / 2.2
        mesh(
          new T.CylinderGeometry(0.006, 0.006, 0.3, 6),
          sm1,
          -0.045,
          0.37,
          0.14,
          spine
        )
        mesh(
          new T.CylinderGeometry(0.006, 0.006, 0.3, 6),
          sm1,
          0.045,
          0.37,
          0.14,
          spine
        )
        var cp = mesh(
          new T.CylinderGeometry(0.03, 0.03, 0.014, 14),
          sc,
          0,
          0.2,
          0.14,
          spine
        )
        cp.rotation.x = Math.PI / 2
      }

      var arms = []
      ;[-1, 1].forEach(function (s) {
        var ag = new T.Group()
        ag.position.set(s * 0.205, 0.46, 0)
        spine.add(ag)
        mesh(
          new T.SphereGeometry(0.066, 10, 8),
          cfg.coat ? fm('#f7fafa', 0.7) : topM,
          0,
          0,
          0,
          ag
        )
        var sleeve = cfg.coat ? fm('#f7fafa', 0.7) : topM
        mesh(new Capsule(0.052, 0.2, 4, 10), sleeve, 0, -0.15, 0, ag)
        var fg = new T.Group()
        fg.position.set(0, -0.29, 0)
        ag.add(fg)
        mesh(
          new Capsule(0.046, 0.17, 4, 10),
          cfg.shortSleeves ? skin : sleeve,
          0,
          -0.13,
          0,
          fg
        )
        mesh(new T.SphereGeometry(0.046, 10, 8), skin, 0, -0.27, 0, fg)
        arms.push({ up: ag, fore: fg, s: s })
      })
      F.arms = arms
      if (cfg.prop === 'tissue') {
        var tis = mesh(
          new T.SphereGeometry(0.04, 8, 6),
          fm('#ffffff', 0.9),
          0.0,
          -0.3,
          0.02,
          arms[1].fore
        )
        tis.scale.set(1, 0.8, 1)
        mesh(
          new T.SphereGeometry(0.03, 8, 6),
          fm('#f4f4f4', 0.9),
          0.03,
          -0.32,
          0.0,
          arms[1].fore
        )
      }

      var legs = []
      ;[-1, 1].forEach(function (s) {
        var lg = new T.Group()
        lg.position.set(s * 0.085, 0, 0)
        hips.add(lg)
        mesh(new Capsule(0.075, 0.25, 4, 10), botM, 0, -0.19, 0, lg)
        var sg = new T.Group()
        sg.position.set(0, -0.385, 0)
        lg.add(sg)
        mesh(new Capsule(0.063, 0.24, 4, 10), botM, 0, -0.185, 0, sg)
        var fg2 = new T.Group()
        fg2.position.set(0, -0.37, 0)
        sg.add(fg2)
        var shoe = mesh(
          new T.SphereGeometry(0.07, 10, 8),
          shoeM,
          0,
          -0.04,
          0.05,
          fg2
        )
        shoe.scale.set(0.95, 0.55, 1.7)
        if (cfg.prop === 'ankle' && s === 1) {
          mesh(
            new T.CylinderGeometry(0.07, 0.075, 0.12, 12),
            fm('#f2efe6', 0.9),
            0,
            0.0,
            0,
            fg2
          )
          mesh(
            new T.BoxGeometry(0.12, 0.05, 0.16),
            fm('#9fd3f0', 0.6),
            0.0,
            0.0,
            0.07,
            fg2
          )
        }
        legs.push({ thigh: lg, shin: sg, s: s })
      })
      F.legs = legs

      var head = new T.Group()
      head.position.set(0, 0.58, 0)
      spine.add(head)
      F.head = head
      var face = new T.Group()
      face.position.y = 0.17
      head.add(face)
      mesh(
        new T.SphereGeometry(0.17, 20, 16),
        skin,
        0,
        0,
        0,
        face
      ).scale.y = 1.06
      ;[-1, 1].forEach(function (s) {
        mesh(
          new T.SphereGeometry(0.036, 8, 6),
          skin,
          s * 0.168,
          -0.005,
          -0.005,
          face
        ).scale.set(0.5, 1, 0.8)
        var blush = new T.Mesh(
          new T.SphereGeometry(0.03, 8, 6),
          new T.MeshStandardMaterial({
            color: '#f08a8a',
            transparent: true,
            opacity: 0.32,
            roughness: 1,
            depthWrite: false
          })
        )
        blush.position.set(s * 0.095, -0.04, 0.125)
        blush.scale.set(1, 0.6, 0.5)
        face.add(blush)
      })
      F.eyes = []
      ;[-1, 1].forEach(function (s) {
        var eg = new T.Group()
        eg.position.set(s * 0.062, 0.02, 0.148)
        face.add(eg)
        mesh(
          new T.SphereGeometry(0.033, 12, 10),
          fm('#fbfbf8', 0.3),
          0,
          0,
          0,
          eg
        ).scale.z = 0.55
        mesh(
          new T.SphereGeometry(0.019, 10, 8),
          fm('#3a2417', 0.3),
          0,
          0,
          0.016,
          eg
        ).scale.z = 0.5
        mesh(
          new T.SphereGeometry(0.011, 8, 6),
          fm('#050505', 0.3),
          0,
          0,
          0.022,
          eg
        ).scale.z = 0.4
        var glint = new T.Mesh(
          new T.SphereGeometry(0.006, 6, 6),
          new T.MeshBasicMaterial({ color: '#ffffff' })
        )
        glint.position.set(0.008, 0.009, 0.03)
        eg.add(glint)
        F.eyes.push(eg)
      })
      F.brows = []
      ;[-1, 1].forEach(function (s) {
        var b = mesh(
          new T.BoxGeometry(0.052, 0.01, 0.012),
          hairM,
          s * 0.062,
          0.072,
          0.152,
          face
        )
        b.userData.s = s
        F.brows.push(b)
      })
      var noseM = fm(cfg.skin, 0.55)
      F.noseM = noseM
      mesh(
        new T.SphereGeometry(0.024, 10, 8),
        noseM,
        0,
        -0.025,
        0.163,
        face
      ).scale.set(1, 0.9, 0.9)
      if (cfg.prop === 'tissue') noseM.color.set('#e27a74')
      var smile = mesh(
        new T.TorusGeometry(0.034, 0.005, 6, 14, Math.PI),
        fm('#7a2d33', 0.5),
        0,
        -0.045,
        0.158,
        face
      )
      smile.rotation.z = Math.PI
      F.smile = smile
      var open = mesh(
        new T.SphereGeometry(0.03, 10, 8),
        fm('#4a1a1f', 0.5),
        0,
        -0.07,
        0.15,
        face
      )
      open.scale.set(1, 0.2, 0.4)
      open.visible = false
      F.open = open
      mesh(new T.SphereGeometry(0.0, 4, 3), skin, 0, 0, 0, face)

      var cap = mesh(
        new T.SphereGeometry(0.186, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.56),
        hairM,
        0,
        0.01,
        -0.01,
        face
      )
      cap.rotation.x = -0.75
      if (cfg.hairStyle === 'long') {
        mesh(
          new T.SphereGeometry(0.19, 14, 10),
          hairM,
          0,
          -0.15,
          -0.065,
          face
        ).scale.set(1, 1.5, 0.75)
        ;[-1, 1].forEach(function (s) {
          mesh(
            new T.SphereGeometry(0.07, 10, 8),
            hairM,
            s * 0.15,
            -0.1,
            0.0,
            face
          ).scale.set(0.45, 1.5, 0.7)
        })
      } else if (cfg.hairStyle === 'pony') {
        var pt = mesh(new Capsule(0.05, 0.2, 4, 8), hairM, 0, -0.04, -0.2, face)
        pt.rotation.x = 0.5
        mesh(
          new T.TorusGeometry(0.05, 0.012, 6, 12),
          fm('#e0645a', 0.6),
          0,
          0.045,
          -0.165,
          face
        ).rotation.x = 0.4
      }
      if (cfg.beard) {
        mesh(
          new T.SphereGeometry(0.176, 16, 6, 0, Math.PI * 2, 2.18, 0.96),
          fm(cfg.hair, 0.8),
          0,
          0.0,
          0,
          face
        ).scale.y = 1.06
      }
      if (cfg.glasses) {
        var gm = fm('#14363b', 0.4)
        ;[-1, 1].forEach(function (s) {
          mesh(
            new T.TorusGeometry(0.043, 0.006, 8, 18),
            gm,
            s * 0.063,
            0.022,
            0.158,
            face
          )
          mesh(
            new T.BoxGeometry(0.006, 0.006, 0.15),
            gm,
            s * 0.108,
            0.026,
            0.085,
            face
          )
        })
        mesh(new T.BoxGeometry(0.03, 0.006, 0.006), gm, 0, 0.03, 0.162, face)
      }

      F.update = function (dt, t) {
        var k = 1 - Math.exp(-dt * 8),
          seat = F.seat,
          walk = F.walkAmt,
          ph = F.phase
        var talk = F.speaking
        hips.position.y =
          0.83 -
          0.36 * seat +
          (walk > 0.05 ? Math.abs(Math.sin(ph)) * 0.025 * walk : 0)
        legs.forEach(function (l, i) {
          var sw = Math.sin(ph + (i ? Math.PI : 0))
          l.thigh.rotation.x = -1.5 * seat + sw * 0.55 * walk
          var extend = cfg.prop === 'ankle' && l.s === 1 ? 0.45 * seat : 0
          l.shin.rotation.x = 1.5 * seat - extend + Math.max(0, sw) * 0.9 * walk
          l.thigh.rotation.z = l.s * 0.05 * seat
        })
        // arm targets
        F.j = F.j || { a: [0, 0, 0, 0], b: [0, 0, 0, 0] }
        arms.forEach(function (a, i) {
          var sw = Math.sin(ph + (i ? 0 : Math.PI))
          var ux = 0.05 * (1 - seat) + -0.3 * seat + sw * 0.5 * walk,
            fx = -0.12 * (1 - seat) + -1.15 * seat,
            uz = a.s * 0.08
          if (seat > 0.5) {
            if (F.mode === 'write' && i === 1) {
              ux = -0.55 + Math.sin(t * 6) * 0.03
              fx = -1.1 + Math.sin(t * 5) * 0.05
            } else if (talk && i === 1) {
              ux = -0.75 + Math.sin(t * 3.6 + F.seed) * 0.2
              fx = -1.3 + Math.sin(t * 2.7 + F.seed) * 0.35
            } else if (talk && i === 0) {
              fx = -1.25 + Math.sin(t * 2.1 + F.seed) * 0.12
            } else if (cfg.prop === 'head' && i === 1) {
              ux = -1.2
              fx = -2.05
              uz = 0.12
            }
          }
          var j = F.j.a
          j[i * 2] += (ux - j[i * 2]) * k
          j[i * 2 + 1] += (fx - j[i * 2 + 1]) * k
          a.up.rotation.x = j[i * 2]
          a.fore.rotation.x = j[i * 2 + 1]
          a.up.rotation.z += (uz - a.up.rotation.z) * k
        })
        spine.scale.y = 1 + Math.sin(t * 1.7 + F.seed) * 0.008
        // head
        var pitch = F.headPitch + (talk ? Math.sin(t * 9 + F.seed) * 0.03 : 0)
        head.rotation.x += (pitch - head.rotation.x) * k
        head.rotation.y +=
          (F.lookYaw + Math.sin(t * 0.5 + F.seed) * 0.1 - head.rotation.y) * k
        head.rotation.z +=
          ((cfg.mood || 0) * 0.12 * Math.sin(t * 0.3 + F.seed) -
            head.rotation.z) *
          k
        // blink
        if (t > F.blinkAt) {
          F.blink = 0.14
          F.blinkAt = t + 2.2 + rnd() * 3
        }
        var droop = 1 - (cfg.mood || 0) * 0.25
        var eo = F.blink > 0 ? 0.1 : droop
        F.blink = Math.max(0, F.blink - dt)
        F.eyes.forEach(function (e) {
          e.scale.y += (eo - e.scale.y) * Math.min(1, dt * 30)
        })
        F.brows.forEach(function (b) {
          b.rotation.z = -b.userData.s * (cfg.mood || 0) * 0.45
        })
        // mouth
        if (talk) {
          var amp =
            Math.abs(Math.sin(t * 13 + F.seed)) *
            (0.55 + 0.45 * Math.sin(t * 4.7))
          open.visible = true
          smile.visible = false
          open.scale.y = 0.18 + amp * 1.05
        } else {
          open.visible = false
          smile.visible = true
          smile.scale.y = 1 - (cfg.mood || 0) * 0.5
        }
      }
      return F
    }

    var doctor = makeFigure({
      skin: '#c98e6a',
      hair: '#1b1b1d',
      top: '#1f9aa0',
      bottom: '#2f4a52',
      coat: true,
      stetho: true,
      glasses: true,
      hairStyle: 'short',
      mood: 0
    })
    doctor.root.position.set(0, 0, -1.25)
    doctor.seat = 1
    doctor.headPitch = 0.05
    scene.add(doctor.root)
    var patient = null
    function buildPatient (c) {
      if (patient) {
        scene.remove(patient.root)
        patient.root.traverse(function (o) {
          if (o.geometry) o.geometry.dispose()
          if (o.material) {
            ;(Array.isArray(o.material) ? o.material : [o.material]).forEach(
              function (m) {
                m.dispose()
              }
            )
          }
        })
      }
      var L = c.look
      patient = makeFigure({
        skin: L.skin,
        hair: L.hair,
        top: L.top,
        bottom: L.bottom,
        hairStyle: L.hairStyle,
        prop: L.prop,
        beard: L.beard,
        mood: L.mood,
        shortSleeves: L.prop === 'ankle'
      })
      patient.root.visible = false
      scene.add(patient.root)
      drawEMR(c.name, c.age)
    }
    buildPatient({
      name: '',
      age: 0,
      look: {
        skin: '#e7b999',
        hair: '#2a1d18',
        hairStyle: 'long',
        top: '#e08a6e',
        bottom: '#3a4a63',
        prop: 'tissue',
        mood: 0.5
      }
    })

    /* ---------- patient movement ---------- */
    var PATH_IN = [
      [2.2, 4.8],
      [2.2, 3.0],
      [1.3, 2.0],
      [0.9, 0.85],
      [0.0, 0.85]
    ]
    var PATH_OUT = [
      [0.0, 0.85],
      [0.9, 0.85],
      [1.3, 2.0],
      [2.2, 3.0],
      [2.2, 4.8]
    ]
    var P = {
      mode: 'hidden',
      path: PATH_IN,
      i: 0,
      x: 2.2,
      z: 4.8,
      yawT: 0,
      enterRes: null,
      leaveRes: null,
      door: 0
    }
    function resolveAll () {
      var a = P.enterRes,
        b = P.leaveRes
      P.enterRes = P.leaveRes = null
      if (a) a()
      if (b) b()
    }
    function updatePatient (dt) {
      var F = patient
      if (P.mode === 'hidden') {
        F.root.visible = false
        chairP.position.z = 0.85
        return
      }
      F.root.visible = true
      var moving = false
      if (P.mode === 'entering' || P.mode === 'leaving') {
        var nx = P.path[P.i + 1]
        if (nx) {
          var dx = nx[0] - P.x,
            dz = nx[1] - P.z,
            d = Math.hypot(dx, dz),
            step = 1.3 * dt
          if (d <= step) {
            P.x = nx[0]
            P.z = nx[1]
            P.i++
          } else {
            P.x += (dx / d) * step
            P.z += (dz / d) * step
            P.yawT = Math.atan2(dx, dz)
            moving = true
          }
        }
        if (P.i >= P.path.length - 1) {
          if (P.mode === 'entering') {
            P.mode = 'sitting'
            P.yawT = Math.PI
          } else {
            P.mode = 'hidden'
            F.root.visible = false
            var r = P.leaveRes
            P.leaveRes = null
            if (r) r()
            return
          }
        }
      }
      if (P.mode === 'sitting') {
        F.seat = Math.min(1, F.seat + dt * 1.1)
        if (F.seat >= 1) {
          P.mode = 'seated'
          var r2 = P.enterRes
          P.enterRes = null
          if (r2) r2()
        }
      } else if (P.mode === 'standing') {
        F.seat = Math.max(0, F.seat - dt * 1.1)
        if (F.seat <= 0) {
          P.mode = 'leaving'
          P.path = PATH_OUT
          P.i = 0
        }
      }
      chairP.position.z = 1.6 - 0.75 * sm(F.seat)
      F.root.position.set(P.x, 0, P.z)
      F.root.rotation.y +=
        angleDiff(P.yawT, F.root.rotation.y) * (1 - Math.exp(-dt * 7))
      F.walkAmt += ((moving ? 1 : 0) - F.walkAmt) * (1 - Math.exp(-dt * 9))
      if (moving) F.phase += dt * 7.5
      F.lookYaw = 0
    }
    function doorTarget () {
      return (P.mode === 'entering' || P.mode === 'leaving') &&
        P.z > 2.4 &&
        Math.abs(P.x - 2.2) < 1.6
        ? 1
        : 0
    }

    /* ---------- cameras ---------- */
    var SHOTS = {
      auth: { p: [-3.5, 1.6, 3.0], l: [0.9, 1.15, -0.9], fov: 46 },
      arrival: { p: [-3.3, 1.8, -2.9], l: [1.2, 1.0, 2.4], fov: 52 },
      wide: { p: [3.4, 1.85, -0.1], l: [0, 1.15, -0.28], fov: 46 },
      patientCU: { p: [0.78, 1.52, -2.45], l: [-0.02, 1.22, 0.9], fov: 36 },
      doctorCU: { p: [-0.8, 1.5, 2.5], l: [0.02, 1.28, -1.25], fov: 36 }
    }
    var shotName = 'auth',
      portrait = false
    var camPos = new T.Vector3(
        SHOTS.auth.p[0],
        SHOTS.auth.p[1],
        SHOTS.auth.p[2]
      ),
      camLook = new T.Vector3(
        SHOTS.auth.l[0],
        SHOTS.auth.l[1],
        SHOTS.auth.l[2]
      ),
      camFov = 46
    var tp = new T.Vector3(),
      tl = new T.Vector3(),
      par = { x: 0, y: 0 },
      parS = { x: 0, y: 0 }
    function activeShot () {
      var n = shotName
      if (portrait && n === 'wide') n = 'doctorCU'
      return SHOTS[n]
    }
    function updateCamera (dt, t) {
      var s = activeShot()
      tp.set(s.p[0], s.p[1], s.p[2])
      tl.set(s.l[0], s.l[1], s.l[2])
      if (!reduce && shotName === 'auth') {
        tp.x += Math.sin(t * 0.12) * 0.6
        tp.y += Math.sin(t * 0.09) * 0.07
      }
      var k = 1 - Math.exp(-dt * 2.4)
      camPos.lerp(tp, k)
      camLook.lerp(tl, k)
      camFov += (s.fov - camFov) * k
      parS.x += (par.x - parS.x) * Math.min(1, dt * 4)
      parS.y += (par.y - parS.y) * Math.min(1, dt * 4)
      camera.position.copy(camPos)
      camera.lookAt(camLook)
      camera.translateX(parS.x * 0.22)
      camera.translateY(-parS.y * 0.1)
      camera.lookAt(camLook)
      camera.fov = camFov + (portrait ? 12 : 0)
      camera.updateProjectionMatrix()
      camera.updateMatrixWorld()
    }

    /* ---------- post-processing and quality ---------- */
    var quality = 'high',
      exposure = 1,
      pr = 1,
      W = 1,
      H = 1
    var composer = null,
      bloom = null,
      grade = null
    var gradeShader = {
      uniforms: {
        tDiffuse: { value: null },
        uExposure: { value: 1.2 },
        uVig: { value: 0.34 }
      },
      vertexShader:
        'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'uniform sampler2D tDiffuse; uniform float uExposure; uniform float uVig; varying vec2 vUv;',
        'vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }',
        'vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4))-0.055, step(vec3(0.0031308), c)); }',
        'void main(){',
        '  vec3 c = texture2D(tDiffuse, vUv).rgb * uExposure;',
        '  c = aces(c);',
        '  float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = mix(vec3(l), c, 1.1);',
        '  float v = smoothstep(0.35, 0.95, length((vUv - 0.5) * vec2(1.15, 1.0)) * 1.35);',
        '  c *= 1.0 - uVig * v;',
        '  gl_FragColor = vec4(toSRGB(c), 1.0);',
        '}'
      ].join('\n')
    }
    var hasComposer = !!(
      T.EffectComposer &&
      T.RenderPass &&
      T.UnrealBloomPass &&
      T.ShaderPass &&
      T.MaskPass &&
      T.CopyShader
    )
    function buildComposer () {
      try {
        var rt = new T.WebGLRenderTarget(W, H, {
          type: T.HalfFloatType,
          samples: 4
        })
        composer = new T.EffectComposer(renderer, rt)
        composer.addPass(new T.RenderPass(scene, camera))
        bloom = new T.UnrealBloomPass(new T.Vector2(W, H), 0.5, 0.6, 1.0)
        composer.addPass(bloom)
        grade = new T.ShaderPass(gradeShader)
        composer.addPass(grade)
        composer.setPixelRatio(pr)
        composer.setSize(W, H)
      } catch (e) {
        console.warn('Post-processing unavailable, using direct rendering', e)
        composer = null
        hasComposer = false
      }
    }
    function recompile () {
      scene.traverse(function (o) {
        if (o.material) {
          ;(Array.isArray(o.material) ? o.material : [o.material]).forEach(
            function (m) {
              m.needsUpdate = true
            }
          )
        }
      })
    }
    function applyExposure () {
      renderer.toneMappingExposure = exposure
      if (grade) grade.uniforms.uExposure.value = 1.2 * exposure
    }
    function setQuality (q) {
      quality = q === 'low' ? 'low' : 'high'
      var hq = quality === 'high'
      pr = hq ? Math.min(window.devicePixelRatio || 1, 1.5) : 1
      renderer.shadowMap.enabled = hq
      sun.castShadow = hq
      dust.visible = hq
      if (hq && hasComposer && !composer) buildComposer()
      renderer.toneMapping =
        hq && composer ? T.NoToneMapping : T.ACESFilmicToneMapping
      applyExposure()
      recompile()
      resize()
    }
    function resize () {
      W = window.innerWidth || 1
      H = window.innerHeight || 1
      renderer.setPixelRatio(pr)
      renderer.setSize(W, H, false)
      if (composer) {
        composer.setPixelRatio(pr)
        composer.setSize(W, H)
      }
      camera.aspect = W / H
      portrait = W / H < 0.85
      camera.updateProjectionMatrix()
    }
    window.addEventListener('resize', resize)

    /* ---------- screen anchors for the speech bubbles ---------- */
    var vTmp = new T.Vector3(),
      anchors = {
        doctor: { x: 0, y: 0, on: false },
        patient: { x: 0, y: 0, on: false }
      }
    function anchor (F, out, visible) {
      F.head.getWorldPosition(vTmp)
      vTmp.y += 0.5
      vTmp.project(camera)
      out.x = (vTmp.x * 0.5 + 0.5) * W
      out.y = (-vTmp.y * 0.5 + 0.5) * H
      out.on = visible && vTmp.z > -1 && vTmp.z < 1
    }

    /* ---------- frame loop ---------- */
    var last = performance.now(),
      clock = 0,
      frames = 0,
      acc = 0,
      warm = 0,
      slow = 0,
      errors = 0
    function frame (now) {
      requestAnimationFrame(frame)
      if (document.hidden) {
        last = now
        return
      }
      var dt = Math.min(0.05, (now - last) / 1000)
      last = now
      clock += dt
      try {
        updatePatient(dt)
        var dTarget = doorTarget()
        P.door += (dTarget - P.door) * Math.min(1, dt * 3)
        hinge.rotation.y = 1.35 * P.door
        var d = new Date()
        minH.rotation.z =
          (-(d.getMinutes() + d.getSeconds() / 60) / 60) * Math.PI * 2
        hourH.rotation.z =
          (-((d.getHours() % 12) + d.getMinutes() / 60) / 12) * Math.PI * 2
        doctor.lookYaw = 0
        doctor.update(dt, clock)
        patient.update(dt, clock)
        if (dust.visible) {
          for (var i = 0; i < DUST; i++) {
            dustPos[i * 3 + 1] += dt * 0.02
            dustPos[i * 3] += Math.sin(clock * 0.3 + dustSeed[i]) * dt * 0.02
            if (dustPos[i * 3 + 1] > 2.7) dustPos[i * 3 + 1] = 0.3
          }
          dustGeo.attributes.position.needsUpdate = true
        }
        updateCamera(dt, clock)
        anchor(
          doctor.head ? doctor : doctor,
          anchors.doctor,
          hooks.doctorVisible()
        )
        anchor(patient, anchors.patient, P.mode !== 'hidden')
        hooks.onAnchors(anchors)
        if (composer && quality === 'high') composer.render(dt)
        else renderer.render(scene, camera)
        errors = 0
      } catch (e) {
        console.error(e)
        errors++
        if (errors > 3 && quality === 'high') {
          composer = null
          hasComposer = false
          setQuality('low')
          hooks.onDowngrade('Graphics reduced after a rendering error.')
          errors = 0
        }
      }
      // automatic downgrade for slow GPUs
      acc += dt
      frames++
      if (acc > 1) {
        var fps = frames / acc
        frames = 0
        acc = 0
        warm++
        if (quality === 'high' && warm > 3) {
          slow = fps < 26 ? slow + 1 : 0
          if (slow >= 3) {
            setQuality('low')
            hooks.onDowngrade(
              'Switched to Performance graphics to keep the game smooth.'
            )
            slow = 0
          }
        }
      }
    }

    resize()
    if (hasComposer) buildComposer()
    setQuality('high')
    requestAnimationFrame(function (n) {
      last = n
      requestAnimationFrame(frame)
    })
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return
      par.x = (e.clientX / (window.innerWidth || 1)) * 2 - 1
      par.y = (e.clientY / (window.innerHeight || 1)) * 2 - 1
    })

    return {
      is3d: true,
      setShot: function (n) {
        if (SHOTS[n]) shotName = n
      },
      setPatientLook: function (c) {
        buildPatient(c)
      },
      patientEnter: function () {
        return new Promise(function (res) {
          resolveAll()
          P.mode = 'entering'
          P.path = PATH_IN
          P.i = 0
          P.x = PATH_IN[0][0]
          P.z = PATH_IN[0][1]
          P.yawT = Math.PI
          patient.seat = 0
          patient.walkAmt = 0
          patient.root.rotation.y = Math.PI
          patient.root.position.set(P.x, 0, P.z)
          chairP.position.z = 1.6
          P.enterRes = res
        })
      },
      patientLeave: function () {
        return new Promise(function (res) {
          if (P.mode === 'hidden') {
            res()
            return
          }
          if (P.mode === 'seated' || P.mode === 'sitting') {
            P.mode = 'standing'
            P.leaveRes = res
            return
          }
          if (P.mode === 'leaving' || P.mode === 'standing') {
            var old = P.leaveRes
            P.leaveRes = function () {
              if (old) old()
              res()
            }
            return
          }
          P.mode = 'hidden'
          patient.root.visible = false
          res()
        })
      },
      resetPatient: function () {
        P.mode = 'hidden'
        patient.seat = 0
        patient.root.visible = false
        chairP.position.z = 0.85
        resolveAll()
      },
      setSpeaking: function (who, on) {
        ;(who === 'doctor' ? doctor : patient).speaking = !!on
      },
      setDoctorMode: function (m) {
        doctor.mode = m
        doctor.headPitch = m === 'write' ? 0.35 : 0.05
      },
      isPatientVisible: function () {
        return P.mode !== 'hidden'
      },
      setQuality: setQuality,
      getQuality: function () {
        return quality
      },
      setExposure: function (v) {
        exposure = v
        applyExposure()
      },
      info: function () {
        return {
          calls: renderer.info.render.calls,
          tris: renderer.info.render.triangles
        }
      }
    }
  }

  /* Used when WebGL or the library is unavailable: same API, no pictures. */
  function createNullWorld (hooks) {
    var present = false,
      timer = null
    function push () {
      var W = window.innerWidth,
        H = window.innerHeight
      hooks.onAnchors({
        doctor: { x: W * 0.36, y: H * 0.5, on: hooks.doctorVisible() },
        patient: { x: W * 0.64, y: H * 0.5, on: present }
      })
    }
    timer = setInterval(push, 200)
    window.addEventListener('resize', push)
    function wait (ms) {
      return new Promise(function (r) {
        setTimeout(r, ms)
      })
    }
    return {
      is3d: false,
      setShot: function () {},
      setPatientLook: function () {},
      patientEnter: function () {
        present = true
        push()
        return wait(500)
      },
      patientLeave: function () {
        return wait(400).then(function () {
          present = false
          push()
        })
      },
      resetPatient: function () {
        present = false
        push()
      },
      setSpeaking: function () {},
      setDoctorMode: function () {},
      isPatientVisible: function () {
        return present
      },
      setQuality: function () {},
      getQuality: function () {
        return 'low'
      },
      setExposure: function () {},
      info: function () {
        return { calls: 0, tris: 0 }
      }
    }
  }

  window.ClinicWorld = {
    createWorld: createWorld,
    createNullWorld: createNullWorld
  }
})()
