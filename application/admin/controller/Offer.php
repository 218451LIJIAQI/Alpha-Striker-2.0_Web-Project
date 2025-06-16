<?php
namespace app\admin\controller;
use app\offer\model\Offer as OfferModel;

class Offer
{
    public function index()
    {
        $model = new OfferModel();
        $where = [];
        if(input('?offer_code')) {
            $where['offer_code'] = input('offer_code');
        }
        $offers = $model->where($where)->select();
        return json(['success' => true, 'data' => $offers]);
    }
    
    public function create()
    {
        try {
            $data = input('post.');
            $model = new OfferModel();
            $result = $model->save($data);
            return json(['success' => $result]);
        } catch (\Exception $e) {
            return json([
                'success' => false,
                'message' => 'Failed to create offer: ' . $e->getMessage()
            ]);
        }
    }
    
    public function update($offer_code)
    {
        $data = input('post.');
        $model = new OfferModel();
        $result = $model->save($data, ['offer_code' => $offer_code]);
        return json(['success' => $result]);
    }
    
    public function delete($offer_code)
    {
        $model = new OfferModel();
        $result = $model->where('offer_code', $offer_code)->delete();
        return json(['success' => $result]);
    }
}