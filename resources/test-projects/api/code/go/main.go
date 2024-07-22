package main

import (
	"application/falang/Api1"
	"application/falang/Api2"
	"application/falang/Objects"
	"application/falang/falang_global"
	"application/falang/main1"
)

type ApisSum struct{}

func (s ApisSum) ObjectsSum(params Api1.IObjectsSumParams) int32 {
	return params.A.X + params.B.Y
}

func (s ApisSum) NumberSum(params Api1.INumberSumParams) int32 {
	return params.A + params.B + params.C
}

type ApisConcat struct{}

func (c ApisConcat) Object2Concat(params Api1.IObject2ConcatParams) string {
	return params.A.A + params.B.A
}

func (c ApisConcat) StringConcat(params Api1.IStringConcatParams) string {
	return params.A + params.B + params.C
}

type ApisObject struct{}

func (c ApisObject) BuildObject1(params Api2.IBuildObject1Params) Objects.Object1 {
	return Objects.Object1{
		X: params.X,
		Y: params.Y,
		Z: params.Z,
	}
}

func (c ApisObject) BuildObject2(params Api2.IBuildObject2Params) Objects.Object2 {
	return Objects.Object2{
		A: params.A,
		B: params.B,
	}
}

func main() {
	apisConcat := ApisConcat{}
	apisSum := ApisSum{}
	apisObject := ApisObject{}
	api1 := Api1.Api1{
		Sum:    apisSum,
		Concat: apisConcat,
	}
	api2 := Api2.Api2{
		BuildObject: apisObject,
	}
	falangApis := falang_global.Apis{
		Api1: api1,
		Api2: api2,
	}
	falangGlobal := falang_global.FalangGlobal{
		Apis:                falangApis,
	}
	mainParams := main1.ImainParams{
		FalangGlobal: falangGlobal,
	}
	main1.Main(mainParams)
}
