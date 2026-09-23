# Naver Map & Hotel Technical Reference

## 주요 엔드포인트 및 데이터 구조

### 1. 즐겨찾기(북마크) API

#### `GET https://map.naver.com/p/api/bookmark`
- 로그인 쿠키(`NID_AUT`, `NID_SES`) 필요
- 주요 구조:
  ```json
  {
    "my": {
      "bookmarkSync": {
        "count": 4936,
        "bookmarks": [
          {
            "bookmark": {
              "bookmarkId": 1234567,
              "name": "숙소명",
              "displayName": "메모",
              "sid": "1117911953",
              "address": "강원 고성군 ...",
              "mcid": "ACCOMMODATION",
              "mcidName": "숙박",
              "type": "place"
            },
            "folderMappings": [
              {
                "folderId": 35367544
              }
            ]
          }
        ]
      }
    }
  }
  ```

#### `GET https://pages.map.naver.com/save-pages/api/maps-bookmark/v3/folders`
- 사용자 저장 폴더 목록 반환
- '숙소', '한식', '카페' 등 폴더 이름과 `folderId`, `bookmarkCount` 확인 가능

---

### 2. 숙소 상세 및 객실 가격 페이지

#### 호텔/리조트 실시간 가격비교
- **URL**: `https://hotels.naver.com/accommodation/search/detail/domestic/{sid}/rates?dAdultCnt={adults}&dCheckIn={YYYY-MM-DD}&dCheckOut={YYYY-MM-DD}`
- **DOM 요약**:
  - `document.title`: 숙소명, 날짜, 인원수 표기
  - 최저가 영역: `em.Rates_price__...`, `span.Price_price__...` 또는 정규식 `\d{1,3}(,\d{3})+원` 매칭 (쿠폰/적립금 제외 상위 가격)

#### 펜션/게스트하우스 객실 탭
- **URL**: `https://map.naver.com/p/entry/place/{sid}?placePath=%2Froom%3FstartDate%3D{YYYY-MM-DD}%26endDate%3D{YYYY-MM-DD}`
- **진입 프레임**: `#entryIframe` (`https://pcmap.place.naver.com/accommodation/{sid}/room?...`)
- **객실 아이템**:
  - 선택자: `li[class*='item'], div[class*='RoomItem'], div[class*='room_item']`
  - 가격 선택자: `em[class*='price'], span[class*='price'], strong[class*='price']`
  - 예약 마감 여부: `텍스트 내 '예약 마감' 또는 '예약이 마감되었습니다'` 포함 여부

---

### 3. 카테고리 필터링 팁 (`mcid`)

네이버 지도 즐겨찾기에서 '숙소' 폴더에 저장되어 있더라도, 주차장이나 편의시설이 섞여 있을 수 있습니다:
- `ACCOMMODATION`: 실제 호텔, 펜션, 게스트하우스, 리조트, 캠핑장
- `CAR`: 공영 주차장, 차박 스팟 (제외)
- `TRAVEL`: 해수욕장 샤워장, 관광지 (제외)
- `ADDRESS`: 지번/도로명 포인트 (제외)
